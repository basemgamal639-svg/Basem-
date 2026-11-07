"""Morning Page stub — parent will add Grok Bot routines later."""
from __future__ import annotations

import json
from pathlib import Path

import config
from links import SIGNUP_URL, coin_url


def build_night_summary(db) -> dict:
    scans = db.recent_scans(500)
    audits = db.recent_audits(200)
    verdicts = db.recent_verdicts(200)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM positions WHERE status='closed' ORDER BY id DESC LIMIT 200")
        closed = [dict(r) for r in cur.fetchall()]
    red = [p for p in closed if (p.get("pnl_usd") or 0) < 0]
    green = [p for p in closed if (p.get("pnl_usd") or 0) >= 0]
    for p in red + green:
        p["coin_url"] = coin_url(p["mint"])
    return {
        "red": red,
        "green": green,
        "scans_killed": [s for s in scans if s.get("verdict") == "kill"],
        "audits_rejected": [a for a in audits if not a.get("passed")],
        "analyst_rejects": [v for v in verdicts if not v.get("passed")],
        "footer": f"New to Pump.fun? {SIGNUP_URL}",
        "ts": config.now_iso(),
    }


def write_summary_file(db, path: Path | None = None) -> Path:
    path = path or (Path(__file__).resolve().parent / "data" / "last-report.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    summary = build_night_summary(db)
    path.write_text(json.dumps(summary, indent=2, default=str))
    db.clear_skips()
    return path
