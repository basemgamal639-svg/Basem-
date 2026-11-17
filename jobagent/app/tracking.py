"""Reply/bounce tracking from Gmail threads and follow-up scheduling (4 business days, only if unanswered)."""
from __future__ import annotations
import re
from datetime import datetime, timedelta

from sqlalchemy import select

from . import emailgen
from .db import Application, Company, Event, Job, Suppression

REJECT = re.compile(r"unfortunately|not (be )?moving forward|other candidates|has been filled|regret to|will not be proceeding|not selected|decided to pursue", re.I)
INTERVIEW = re.compile(r"interview|schedule a (call|time|meeting)|your availability|available (for|to) (a )?(call|meet|chat)|would like to meet|phone screen|come in", re.I)
OPTOUT = re.compile(r"unsubscribe|remove me|do not contact|don't contact|stop (emailing|contacting)", re.I)
BOUNCE_FROM = re.compile(r"mailer-daemon|postmaster", re.I)
BOUNCE_SUBJ = re.compile(r"delivery status notification|undeliverable|mail delivery (failed|subsystem)|returned mail|delivery failure", re.I)


def classify_reply(sender: str, subject: str, text: str) -> str:
    if BOUNCE_FROM.search(sender) or BOUNCE_SUBJ.search(subject):
        return "bounce"
    blob = f"{subject} {text}"
    if OPTOUT.search(blob):
        return "optout"
    if REJECT.search(blob):
        return "rejection"
    if INTERVIEW.search(blob):
        return "interview"
    return "reply"


def add_business_days(dt: datetime, n: int) -> datetime:
    d = dt
    while n > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def sync_replies(ctx, stats: dict) -> None:
    me = ctx.mailer.my_address.lower()
    with ctx.session() as s:
        apps = s.scalars(select(Application).where(Application.status == "sent", Application.gmail_thread_id.is_not(None))).all()
        for app in apps:
            job = app.job
            if job.status in ("employer_rejected", "interview", "bounced", "closed"):
                continue
            for m in ctx.mailer.get_thread(app.gmail_thread_id):
                if m["id"] == app.gmail_message_id or me in m["from"].lower() or s.scalar(select(Event.id).where(Event.gmail_message_id == m["id"])):
                    continue
                kind = classify_reply(m["from"], m["subject"], m["snippet"])
                s.add(Event(application_id=app.id, gmail_message_id=m["id"], kind=kind, snippet=m["snippet"][:500], at=datetime.fromtimestamp(m["ts"])))
                stats["replies"] = stats.get("replies", 0) + (kind != "bounce")
                if kind == "bounce":
                    if app.contact:
                        app.contact.bounced = True
                    app.status, app.error = "failed", "bounced: address rejected delivery"
                    job.status = "new"   # next cycle tries the next verified contact, if any
                    if job.company_id:
                        s.get(Company, job.company_id).contacted_at = None
                elif kind == "optout":
                    s.merge(Suppression(email=app.to_email, reason="asked not to be contacted"))
                    if job.company_id:
                        s.get(Company, job.company_id).do_not_contact = True
                    job.status = "ignored"
                elif kind == "rejection":
                    job.status = "employer_rejected"
                elif kind == "interview":
                    job.status = "interview"
                elif job.status in ("applied", "followup_due"):
                    job.status = "replied"


def due_date(ctx, app: Application) -> datetime:
    return add_business_days(app.sent_at, ctx.cfg["email"]["followup_after_business_days"])


def queue_followups(ctx, stats: dict) -> None:
    """Draft one follow-up per unanswered application once its business-day wait has passed."""
    maxf = ctx.cfg["email"]["max_followups"]
    now = ctx.now().replace(tzinfo=None)
    with ctx.session() as s:
        jobs = s.scalars(select(Job).where(Job.status == "applied")).all()
        for job in jobs:
            first = s.scalar(select(Application).where(Application.job_id == job.id, Application.kind == "initial", Application.status == "sent"))
            if not first or not first.sent_at:
                continue
            fups = s.scalars(select(Application).where(Application.job_id == job.id, Application.kind == "followup")).all()
            if len(fups) >= maxf or s.scalar(select(Event.id).join(Application).where(Application.job_id == job.id)):
                continue
            if due_date(ctx, first) > now:
                continue
            mail = emailgen.build_followup(ctx, job, first.subject, first.contact.name if first.contact else None)
            s.add(Application(job_id=job.id, contact_id=first.contact_id, kind="followup", to_email=first.to_email, subject=mail["subject"],
                              body=mail["body"], warnings=mail["warnings"], status="draft", created_at=now))
            job.status = "followup_due"
            stats["followups_drafted"] = stats.get("followups_drafted", 0) + 1
