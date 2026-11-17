"""python -m app.cli <command>"""
from __future__ import annotations
import argparse, json, sys

from . import pipeline, report
from .settings import ROOT, build_ctx
from .sources import RawJob


def main(argv=None):
    ap = argparse.ArgumentParser(prog="jobagent")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("gmail-auth", help="one-time Gmail OAuth consent")
    sub.add_parser("run-once", help="run a full search cycle now")
    sv = sub.add_parser("serve", help="dashboard + scheduler (the always-on service)"); sv.add_argument("--host", default="127.0.0.1"); sv.add_argument("--port", type=int, default=8000)
    sub.add_parser("check", help="verify config, CV, keys, DB (read-only)")
    sub.add_parser("report", help="print today's report (use --send to email it)").add_argument("--send", action="store_true")
    m = sub.add_parser("mode", help="approval | auto"); m.add_argument("mode")
    a = sub.add_parser("add-job", help="import a listing you found manually (Indeed/LinkedIn/etc.)")
    for f in ("title", "company", "location", "url"):
        a.add_argument(f"--{f}", required=True)
    a.add_argument("--description", default=""); a.add_argument("--description-file"); a.add_argument("--salary", default=None)
    args = ap.parse_args(argv)

    if args.cmd == "gmail-auth":
        from .mailer import gmail_auth
        return gmail_auth(ROOT)
    ctx = build_ctx()
    if args.cmd == "check":
        import os
        pdf = ROOT / ctx.profile["cv_path"]
        rows = [("CV PDF", pdf.exists()), ("Claude API key", bool(ctx.llm)), ("Gmail connected (MAILER=gmail + token.json)", ctx.mailer.is_real),
                ("Job sources enabled: " + (", ".join(x.name for x in ctx.sources) or "NONE"), bool(ctx.sources)),
                ("Company-website finder (BRAVE_API_KEY)", bool(os.getenv("BRAVE_API_KEY"))),
                ("profile.relocation_sentence set", bool(ctx.profile.get("relocation_sentence"))),
                ("Dashboard token (needed only for remote access)", bool(os.getenv("DASHBOARD_TOKEN")))]
        for label, ok in rows:
            print(("[ok]  " if ok else "[--]  ") + label)
        print("mode:", pipeline.get_mode(ctx))
    elif args.cmd == "run-once":
        print(json.dumps(pipeline.run_cycle(ctx, "manual"), indent=2, default=str))
    elif args.cmd == "mode":
        pipeline.set_mode(ctx, args.mode); print("mode =", args.mode)
    elif args.cmd == "report":
        subj, text = report.build_report(ctx); print(subj, "\n\n", text)
        if args.send:
            report.send_report(ctx)
    elif args.cmd == "add-job":
        desc = open(args.description_file).read() if args.description_file else args.description
        import hashlib
        st: dict = {}
        pipeline.ingest(ctx, [RawJob("manual", hashlib.sha1(args.url.encode()).hexdigest()[:16], args.url, args.title, args.company, args.location, desc, args.salary)], st)
        pipeline.prepare_drafts(ctx, st); print(st)
    elif args.cmd == "serve":
        import uvicorn
        from . import scheduler
        from .web import create_app
        scheduler.start(ctx)
        uvicorn.run(create_app(ctx), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
