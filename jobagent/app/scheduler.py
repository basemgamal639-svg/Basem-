"""Always-on scheduler: searches at 08:00 / 13:00 / 18:00 Toronto time, reply sync every 2h, daily report."""
from __future__ import annotations
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from . import pipeline, report, tracking


def start(ctx) -> BackgroundScheduler:
    sch = BackgroundScheduler(timezone=ctx.cfg["timezone"], job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600})
    for t in ctx.cfg["schedule"]["search_times"]:
        h, m = map(int, t.split(":"))
        sch.add_job(pipeline.run_cycle, CronTrigger(hour=h, minute=m), args=[ctx, f"scheduled-{t}"], id=f"search-{t}")
    h, m = map(int, ctx.cfg["schedule"]["report_time"].split(":"))
    sch.add_job(report.send_report, CronTrigger(hour=h, minute=m), args=[ctx], id="daily-report")
    sch.add_job(lambda: tracking.sync_replies(ctx, {}), "interval", hours=ctx.cfg["schedule"]["reply_sync_every_hours"], id="reply-sync")
    sch.start()
    return sch
