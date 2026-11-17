"""Search -> dedupe -> score -> contacts -> draft -> (approve) -> verify -> send. Every send passes `gate()`."""
from __future__ import annotations
import hashlib, re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from . import contacts as ct, emailgen, matching
from .db import Application, Company, Contact, Job, Run, Suppression, get_setting, set_setting
from .sources import RawJob

CONF = ["low", "medium", "high"]
CLOSED_PHRASES = re.compile(r"no longer (available|accepting)|position (has been|is) filled|job (has )?(expired|closed)|this job is closed|posting (has )?(expired|closed)|not accepting applications|job not found|expired", re.I)


def utc_now(ctx) -> datetime:
    return ctx.now().astimezone(timezone.utc).replace(tzinfo=None)


def local_now(ctx) -> datetime:
    return ctx.now().replace(tzinfo=None)


def fingerprint(company: str, title: str, location: str) -> str:
    city = location.split(",")[0].strip().lower()
    return hashlib.sha1(f"{ct.norm_company(company)}|{re.sub(r'[^a-z0-9]+', ' ', title.lower()).strip()}|{city}".encode()).hexdigest()


# ------------------------------------------------------------------ settings / mode
def get_mode(ctx) -> str:
    with ctx.session() as s:
        return get_setting(s, "mode", "approval")


def real_sends(ctx) -> int:
    with ctx.session() as s:
        return s.scalar(select(func.count()).select_from(Application).where(Application.status == "sent", Application.dry_run == False, Application.kind == "initial")) or 0  # noqa: E712


def set_mode(ctx, mode: str) -> None:
    if mode not in ("approval", "auto"):
        raise ValueError("mode must be 'approval' or 'auto'")
    if mode == "auto":
        need = ctx.cfg["email"]["unlock_auto_after_real_sends"]
        if real_sends(ctx) < need:
            raise ValueError(f"Auto-send stays locked until {need} real applications have been approved and sent (done: {real_sends(ctx)}). Test in approval mode first.")
        if not ctx.mailer.is_real:
            raise ValueError("Auto-send requires Gmail to be connected (MAILER=gmail + token.json).")
    with ctx.session() as s:
        set_setting(s, "mode", mode)


# ------------------------------------------------------------------ ingest
def ingest(ctx, raws: list[RawJob], stats: dict) -> list[int]:
    """Dedupe (same company+title+city, or same source id), age-filter, score. Returns new job ids."""
    max_age = ctx.cfg["search"]["max_age_days"]
    new_ids = []
    with ctx.session() as s:
        for r in raws:
            if not r.title or not r.company:
                continue
            if r.posted_at and utc_now(ctx) - r.posted_at > timedelta(days=max_age):
                stats["too_old"] = stats.get("too_old", 0) + 1
                continue
            fp = fingerprint(r.company, r.title, r.location)
            if s.scalar(select(Job.id).where((Job.fingerprint == fp) | ((Job.source == r.source) & (Job.external_id == r.external_id)))):
                stats["duplicates"] = stats.get("duplicates", 0) + 1
                continue
            lo, hi = matching.parse_salary(r.salary_text, r.salary_lo, r.salary_hi, r.salary_period)
            job = Job(source=r.source, external_id=r.external_id, fingerprint=fp, url=r.url, title=r.title, company=r.company,
                      company_website=r.company_website, location=r.location, description=r.description, salary_min=lo,
                      salary_max=hi, salary_text=r.salary_text or (f"${lo:,.0f}-${hi:,.0f}" if lo else None), posted_at=r.posted_at,
                      discovered_at=local_now(ctx), status="new")
            matching.evaluate(ctx, job)
            s.add(job)
            s.flush()
            new_ids.append(job.id)
            stats["new_jobs"] = stats.get("new_jobs", 0) + 1
            if job.verdict == "suitable":
                stats["suitable"] = stats.get("suitable", 0) + 1
    return new_ids


# ------------------------------------------------------------------ contacts + drafts
def get_company(s, name: str) -> Company:
    n = ct.norm_company(name)
    c = s.scalar(select(Company).where(Company.name_norm == n))
    if not c:
        c = Company(name_norm=n, name=name)
        s.add(c)
        s.flush()
    return c


def prepare_drafts(ctx, stats: dict) -> None:
    allow_multi = ctx.cfg["email"]["allow_multiple_per_company"]
    with ctx.session() as s:
        jobs = s.scalars(select(Job).where(Job.status == "new", Job.verdict == "suitable").order_by(Job.score.desc())).all()
        for job in jobs:
            comp = get_company(s, job.company)
            job.company_id = comp.id
            if comp.do_not_contact:
                job.status, job.notes = "ignored", "Company asked not to be contacted"
                continue
            if not allow_multi and (comp.contacted_at or s.scalar(select(Application.id).join(Job).where(
                    Job.company_id == comp.id, Application.kind == "initial", Application.status.in_(["draft", "approved", "sent"])))):
                job.status = "duplicate_company"
                job.notes = "Already contacted (or drafted) for this company - not contacting twice"
                continue
            if not comp.contacts:
                for c in ct.find_contacts(ctx, job, comp):
                    s.add(Contact(company_id=comp.id, email=c["email"], role=c["role"], source_url=c["source_url"], confidence=c["confidence"], mx_ok=True))
                s.flush()
                s.refresh(comp)
            sup = {x.email for x in s.scalars(select(Suppression)).all()}
            usable = [c for c in comp.contacts if not c.bounced and c.email not in sup and c.mx_ok]
            usable.sort(key=lambda c: -CONF.index(c.confidence))
            if not usable:
                job.status = "no_contact"
                job.notes = ("No verified public HR/hiring email found. Apply manually via the listing: " + job.url +
                             "\nFind a recruiter: " + ct.linkedin_hint(job.company))
                stats["no_contact"] = stats.get("no_contact", 0) + 1
                continue
            best = usable[0]
            mail = emailgen.build_email(ctx, job, best.name)
            s.add(Application(job_id=job.id, contact_id=best.id, kind="initial", to_email=best.email, subject=mail["subject"],
                              body=mail["body"], llm_used=mail["llm_used"], warnings=mail["warnings"], status="draft", created_at=local_now(ctx)))
            job.status = "drafted"
            stats["drafted"] = stats.get("drafted", 0) + 1
            stats["emails_found"] = stats.get("emails_found", 0) + len(usable)


# ------------------------------------------------------------------ verification + gate
def verify_active(ctx, job) -> tuple[str, str]:
    """('active'|'closed'|'unknown', note). 'unknown' = site blocks bots (robots.txt) or unreachable: a human must check."""
    if not job.url:
        return "unknown", "no URL"
    r = ctx.http.get(job.url)
    if r is None:
        return "unknown", "could not be checked automatically (robots.txt or network) - open the link yourself"
    if r.status_code in (404, 410):
        return "closed", f"HTTP {r.status_code}"
    if r.status_code != 200:
        return "unknown", f"HTTP {r.status_code}"
    if CLOSED_PHRASES.search(r.text[:200000]):
        return "closed", "page says the job is closed/expired"
    return "active", "ok"


CRITICAL = ("forbidden", "unsupported", "title/company")


def gate(ctx, s, app: Application, *, manual: bool) -> tuple[bool, str]:
    cfg, job, e = ctx.cfg, app.job, ctx.cfg["email"]
    if get_setting(s, "paused", "0") == "1":
        return False, "system paused"
    if s.get(Suppression, app.to_email) or (app.contact and app.contact.bounced):
        return False, "address suppressed/bounced"
    comp = s.get(Company, job.company_id) if job.company_id else None
    if comp and comp.do_not_contact:
        return False, "company asked not to be contacted"
    if app.kind == "initial":
        if s.scalar(select(Application.id).where(Application.job_id == job.id, Application.kind == "initial", Application.status == "sent", Application.id != app.id)):
            return False, "already applied to this job"
        if comp and not e["allow_multiple_per_company"] and s.scalar(select(Application.id).join(Job).where(
                Job.company_id == comp.id, Application.kind == "initial", Application.status == "sent", Application.id != app.id)):
            return False, "company already contacted"
    else:
        if job.status not in ("applied", "followup_due"):
            return False, f"job status is '{job.status}' - follow-up no longer needed"
    bad = [w for w in (app.warnings or []) if w.startswith(CRITICAL)]
    if bad:
        return False, "email failed fact-check: " + bad[0]
    min_score = cfg["matching"]["min_score_to_keep"] if manual else cfg["matching"]["min_score_to_apply"]
    if app.kind == "initial" and (job.score or 0) < min_score:
        return False, f"score {job.score} below {min_score}"
    if app.kind == "initial" and job.posted_at and utc_now(ctx) - job.posted_at > timedelta(days=cfg["search"]["max_age_days"] * 2):
        return False, "posting is older than 14 days"
    if not (ctx.root / ctx.profile["cv_path"]).exists():
        return False, "CV PDF missing"
    if not manual:
        if CONF.index(app.contact.confidence) < CONF.index(e["auto_min_contact_confidence"]):
            return False, "contact confidence too low for auto-send"
        if app.warnings:
            return False, "email has warnings - needs human review"
    today = local_now(ctx).replace(hour=0, minute=0, second=0, microsecond=0)
    if (s.scalar(select(func.count()).select_from(Application).where(Application.status == "sent", Application.sent_at >= today)) or 0) >= e["daily_send_cap"]:
        return False, "daily send cap reached"
    state, note = verify_active(ctx, job)
    job.last_checked_at = local_now(ctx)
    if state == "closed":
        job.status = "closed"
        app.status = "cancelled"
        return False, f"job no longer active ({note})"
    if state == "unknown" and not manual:
        return False, f"job activity unverified: {note}"
    return True, note


def send_application(ctx, app_id: int, *, manual: bool) -> tuple[bool, str]:
    with ctx.session() as s:
        app = s.get(Application, app_id)
        if app.status not in ("draft", "approved"):
            return False, f"status is {app.status}"
        ok, why = gate(ctx, s, app, manual=manual)
        if not ok:
            app.error = why
            return False, why
        thread = None
        if app.kind == "followup":
            first = s.scalar(select(Application).where(Application.job_id == app.job_id, Application.kind == "initial", Application.status == "sent"))
            thread = first.gmail_thread_id if first else None
        try:
            mid, tid = ctx.mailer.send(app.to_email, app.subject, app.body, ctx.root / ctx.profile["cv_path"], thread_id=thread)
        except Exception as ex:          # network/API failure: keep for retry visibility, never silently drop
            app.status, app.error = "failed", f"{type(ex).__name__}: {ex}"[:500]
            return False, app.error
        app.status, app.error, app.sent_at = "sent", None, local_now(ctx)
        app.gmail_message_id, app.gmail_thread_id, app.dry_run = mid, tid, not ctx.mailer.is_real
        if app.kind == "initial":
            app.job.status = "applied"
            if app.job.company_id:
                s.get(Company, app.job.company_id).contacted_at = local_now(ctx)
        else:
            app.job.status = "applied"
        return True, "sent" if ctx.mailer.is_real else "dry-run (written to outbox/, nothing sent)"


def send_batch(ctx, stats: dict) -> None:
    mode = get_mode(ctx)
    with ctx.session() as s:
        q = select(Application.id, Application.status).where(Application.status.in_(["approved", "draft"]))
        rows = s.execute(q.order_by(Application.id)).all()
    first = True
    for app_id, status in rows:
        manual = status == "approved"
        if status == "draft" and mode != "auto":
            continue
        if not first:
            lo, hi = ctx.cfg["email"]["send_delay_seconds"]
            ctx.sleep_fn(ctx.rand.uniform(lo, hi))
        ok, why = send_application(ctx, app_id, manual=manual)
        if ok:
            first = False
            stats["sent"] = stats.get("sent", 0) + 1
        else:
            stats.setdefault("blocked", []).append(f"#{app_id}: {why}")


# ------------------------------------------------------------------ orchestration
def run_cycle(ctx, label: str = "manual") -> dict:
    from . import tracking
    with ctx.session() as s:
        if get_setting(s, "paused", "0") == "1":
            return {"skipped": "paused"}
        run = Run(label=label, started_at=local_now(ctx), stats={}, errors=[])
        s.add(run)
        s.flush()
        run_id = run.id
    stats, errors = {}, []
    for src in ctx.sources:
        try:
            ingest(ctx, src.fetch(), stats)
        except Exception as ex:
            errors.append(f"{src.name}: {type(ex).__name__}: {ex}")
    for step in (prepare_drafts, tracking.sync_replies, tracking.queue_followups, send_batch):
        try:
            step(ctx, stats)
        except Exception as ex:
            errors.append(f"{step.__name__}: {type(ex).__name__}: {ex}")
    with ctx.session() as s:
        run = s.get(Run, run_id)
        run.finished_at, run.stats, run.errors = local_now(ctx), stats, errors
    return {**stats, "errors": errors}
