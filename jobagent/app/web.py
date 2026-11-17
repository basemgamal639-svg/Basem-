"""Dashboard + approval API (FastAPI). Local-only unless DASHBOARD_TOKEN is set."""
from __future__ import annotations
import hmac, os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from . import pipeline, report, tracking
from .db import Application, Contact, Job, Run, get_setting, set_setting

STATUS_LABEL = {"new": "Suitable", "maybe": "Maybe (60-74)", "rejected": "Not suitable", "no_contact": "Needs manual follow-up",
                "duplicate_company": "Company already contacted", "drafted": "Pending approval", "applied": "Applied",
                "followup_due": "Follow-up due", "replied": "Replied", "interview": "Interview", "employer_rejected": "Rejected",
                "bounced": "Bounced", "closed": "Closed", "ignored": "Ignored"}


class Edit(BaseModel):
    subject: str | None = None
    body: str | None = None


class ModeBody(BaseModel):
    mode: str


def create_app(ctx) -> FastAPI:
    app = FastAPI(title="Job Agent")
    token = os.getenv("DASHBOARD_TOKEN", "")

    def auth(request: Request):
        if token:
            if not hmac.compare_digest(request.headers.get("x-token", ""), token):
                raise HTTPException(401, "token required")
        elif request.client and request.client.host not in ("127.0.0.1", "::1", "testclient"):
            raise HTTPException(403, "set DASHBOARD_TOKEN to expose the dashboard beyond localhost")

    @app.get("/")
    def index():
        return FileResponse(Path(__file__).parent / "static" / "index.html")

    @app.get("/api/overview", dependencies=[Depends(auth)])
    def overview():
        with ctx.session() as s:
            paused = get_setting(s, "paused", "0") == "1"
        return {"stats": report.stats(ctx), "mode": pipeline.get_mode(ctx), "paused": paused, "mailer": "gmail" if ctx.mailer.is_real else "dry-run",
                "real_sends": pipeline.real_sends(ctx), "unlock_needed": ctx.cfg["email"]["unlock_auto_after_real_sends"],
                "llm": bool(ctx.llm), "sources": [x.name for x in ctx.sources]}

    @app.get("/api/jobs", dependencies=[Depends(auth)])
    def jobs(category: str = "", location: str = "", status: str = "", min_salary: float = 0, q: str = "", min_score: float = 0, include_rejected: bool = False):
        with ctx.session() as s:
            qry = select(Job).order_by(Job.discovered_at.desc()).limit(500)
            if category:
                qry = qry.where(Job.category == category)
            if location:
                qry = qry.where(Job.location.ilike(f"%{location}%"))
            if status:
                qry = qry.where(Job.status == status)
            elif not include_rejected:
                qry = qry.where(Job.status != "rejected")
            if min_salary:
                qry = qry.where(Job.salary_max >= min_salary)
            if min_score:
                qry = qry.where(Job.score >= min_score)
            if q:
                qry = qry.where(Job.title.ilike(f"%{q}%") | Job.company.ilike(f"%{q}%"))
            out = []
            for j in s.scalars(qry).all():
                a = next((x for x in sorted(j.applications, key=lambda x: x.id) if x.kind == "initial"), None)
                out.append({"id": j.id, "company": j.company, "position": j.title, "location": j.location, "salary": j.salary_text or "-",
                            "hr_email": a.to_email if a else "", "date_applied": a.sent_at.strftime("%Y-%m-%d") if a and a.sent_at else "",
                            "status": STATUS_LABEL.get(j.status, j.status), "status_key": j.status, "score": j.score, "category": j.category,
                            "url": j.url, "reason": j.reject_reason, "notes": j.notes, "summary": (j.breakdown or {}).get("summary", ""),
                            "dry_run": bool(a and a.dry_run)})
            return out

    @app.get("/api/applications", dependencies=[Depends(auth)])
    def applications(status: str = "draft"):
        with ctx.session() as s:
            rows = s.scalars(select(Application).where(Application.status.in_(["draft", "approved"]) if status == "draft" else Application.status == status).order_by(Application.id.desc()).limit(200)).all()
            return [{"id": a.id, "kind": a.kind, "company": a.job.company, "position": a.job.title, "score": a.job.score, "to": a.to_email,
                     "confidence": a.contact.confidence if a.contact else "", "source": a.contact.source_url if a.contact else "",
                     "subject": a.subject, "body": a.body, "warnings": a.warnings or [], "error": a.error, "job_url": a.job.url, "llm": a.llm_used} for a in rows]

    @app.put("/api/applications/{aid}", dependencies=[Depends(auth)])
    def edit(aid: int, e: Edit):
        from . import emailgen
        with ctx.session() as s:
            a = s.get(Application, aid)
            if not a or a.status not in ("draft", "approved"):
                raise HTTPException(404, "not editable")
            a.subject, a.body = e.subject or a.subject, e.body or a.body
            a.warnings = [w for w in emailgen.guard(a.body, ctx.profile)] + [w for w in (a.warnings or []) if w.startswith("profile.")]
            return {"ok": True, "warnings": a.warnings}

    @app.post("/api/applications/{aid}/approve", dependencies=[Depends(auth)])
    def approve(aid: int):
        with ctx.session() as s:
            a = s.get(Application, aid)
            if not a or a.status not in ("draft", "approved"):   # 'approved' = an earlier send was blocked; allow retry after edits
                raise HTTPException(404, "not awaiting approval")
            a.status = "approved"
        ok, why = pipeline.send_application(ctx, aid, manual=True)
        return {"sent": ok, "message": why}

    @app.post("/api/applications/{aid}/reject", dependencies=[Depends(auth)])
    def reject(aid: int):
        with ctx.session() as s:
            a = s.get(Application, aid)
            a.status = "rejected"
            if a.kind == "initial":
                a.job.status = "ignored"
            else:
                a.job.status = "applied"
        return {"ok": True}

    @app.post("/api/mode", dependencies=[Depends(auth)])
    def mode(b: ModeBody):
        try:
            pipeline.set_mode(ctx, b.mode)
        except ValueError as e:
            raise HTTPException(400, str(e))
        return {"mode": b.mode}

    @app.post("/api/pause/{flag}", dependencies=[Depends(auth)])
    def pause(flag: int):
        with ctx.session() as s:
            set_setting(s, "paused", str(int(flag)))
        return {"paused": bool(flag)}

    @app.post("/api/run", dependencies=[Depends(auth)])
    def run_now():
        return pipeline.run_cycle(ctx, "manual")

    @app.get("/api/runs", dependencies=[Depends(auth)])
    def runs():
        with ctx.session() as s:
            return [{"label": r.label, "at": r.started_at.isoformat(), "stats": r.stats, "errors": r.errors} for r in s.scalars(select(Run).order_by(Run.id.desc()).limit(15))]

    return app
