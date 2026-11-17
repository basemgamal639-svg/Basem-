"""Daily email report (sent to yourself through Gmail) + the numbers the dashboard shows."""
from __future__ import annotations
from datetime import timedelta

from sqlalchemy import func, select

from . import tracking
from .db import Application, Company, Contact, Event, Job


def stats(ctx) -> dict:
    with ctx.session() as s:
        c = lambda q: s.scalar(q) or 0
        sent = Application.status == "sent"
        return {
            "jobs_discovered": c(select(func.count()).select_from(Job)),
            "suitable_jobs": c(select(func.count()).select_from(Job).where(Job.verdict == "suitable")),
            "applications_sent": c(select(func.count()).select_from(Application).where(sent, Application.kind == "initial")),
            "hr_emails_found": c(select(func.count()).select_from(Contact)),
            "companies_contacted": c(select(func.count()).select_from(Company).where(Company.contacted_at.is_not(None))),
            "pending_approval": c(select(func.count()).select_from(Application).where(Application.status == "draft", Application.kind == "initial")),
            "interviews": c(select(func.count()).select_from(Job).where(Job.status == "interview")),
            "rejections": c(select(func.count()).select_from(Job).where(Job.status == "employer_rejected")),
            "followups_required": c(select(func.count()).select_from(Application).where(Application.status == "draft", Application.kind == "followup")),
            "manual_followup_needed": c(select(func.count()).select_from(Job).where(Job.status == "no_contact")),
        }


def build_report(ctx, hours: int = 24) -> tuple[str, str]:
    now = ctx.now().replace(tzinfo=None)
    since = now - timedelta(hours=hours)
    with ctx.session() as s:
        new = s.scalars(select(Job).where(Job.discovered_at >= since, Job.verdict == "suitable").order_by(Job.score.desc())).all()
        n_all = s.scalar(select(func.count()).select_from(Job).where(Job.discovered_at >= since)) or 0
        sent = s.scalars(select(Application).where(Application.status == "sent", Application.sent_at >= since)).all()
        replies = s.scalars(select(Event).where(Event.at >= since)).all()
        upcoming = s.scalars(select(Job).where(Job.status == "applied")).all()
        manual = s.scalars(select(Job).where(Job.status == "no_contact", Job.discovered_at >= since)).all()
        pending = s.scalar(select(func.count()).select_from(Application).where(Application.status == "draft")) or 0
        lines = [f"Job search report - {now:%A %B %d, %Y}", "",
                 f"New listings found: {n_all}  |  suitable (score >= {ctx.cfg['matching']['min_score_to_apply']}): {len(new)}",
                 f"Applications sent: {len(sent)}  |  waiting for your approval: {pending}", ""]
        lines.append("NEW OPPORTUNITIES")
        lines += [f"  {j.score:>5.1f}  {j.title} - {j.company} ({j.location}) {j.url}" for j in new[:15]] or ["  none"]
        lines += ["", "COMPANIES CONTACTED"]
        lines += [f"  {a.job.company}: {a.job.title} -> {a.to_email}{'  [DRY RUN]' if a.dry_run else ''}" for a in sent] or ["  none"]
        lines += ["", "REPLIES RECEIVED"]
        lines += [f"  [{e.kind}] {s.get(Application, e.application_id).job.company}: {e.snippet[:120]}" for e in replies] or ["  none"]
        lines += ["", "UPCOMING FOLLOW-UPS"]
        ups = []
        for j in upcoming:
            first = next((a for a in j.applications if a.kind == "initial" and a.status == "sent"), None)
            if first and not any(a.kind == "followup" for a in j.applications):
                ups.append((tracking.due_date(ctx, first), j))
        lines += [f"  {d:%a %b %d}: {j.company} - {j.title}" for d, j in sorted(ups, key=lambda x: x[0])[:15]] or ["  none"]
        if manual:
            lines += ["", "NO VERIFIED EMAIL FOUND - APPLY MANUALLY"]
            lines += [f"  {j.title} - {j.company}: {j.url}" for j in manual[:15]]
    text = "\n".join(lines)
    return f"Job search report: {len(sent)} sent, {len(new)} new matches, {pending} awaiting approval", text


def send_report(ctx) -> None:
    subject, text = build_report(ctx)
    ctx.mailer.send(ctx.profile["email"], subject, text, None)
