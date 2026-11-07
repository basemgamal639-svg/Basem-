"""Settings with defaults (STEP 10), validation, change log."""
from __future__ import annotations

import logging
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("config")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
LOG_DIR = ROOT / "logs"
SECRETS_DIR = ROOT / ".secrets"

DEFAULTS: dict[str, Any] = {
    # scanner
    "scanner.min_liquidity_usd": 40000,
    "scanner.max_top10_pct": 25,
    "scanner.max_h1_change_pct": 80,
    "scanner.poll_s": 60,
    "scanner.min_pool_age_min": 10,
    "scanner.max_wait_min": 60,
    "scanner.runner_h24_pct": 300,
    "scanner.dex_max_req_per_min": 250,
    "scanner.ws_silent_s": 120,
    # auditor
    "auditor.enabled": True,
    "auditor.max_dev_pct": 5,
    "auditor.max_top10_pct": 25,
    "auditor.min_lp_locked_pct": 99,
    "auditor.min_pool_age_min": 10,
    "auditor.max_bundled": 5,
    "auditor.max_delegated_accounts": 10,
    "auditor.retries": 3,
    "auditor.liq_drop_pct": 50,
    # analyst
    "analyst.mode": "rules",
    "analyst.min_alive_6h": 0.70,
    "analyst.min_organic": 0.65,
    "analyst.max_chase": 0.30,
    "analyst.min_score": 70,
    "analyst.timeout_s": 10,
    "analyst.alive_volume_h1": 25000,
    "analyst.organic_buys_h1": 150,
    "analyst.bundled_penalty": 0.5,
    "analyst.bundled_penalty_from": 3,
    "analyst.flush_drop_m5_pct": 5,
    "analyst.chase_h1_pct": 80,
    # executor
    "executor.stack_pct": 8,
    "executor.max_pool_pct": 2,
    "executor.min_ticket_usd": 47.50,
    "executor.below_min": "bump",
    "executor.recheck_liq_drop_pct": 20,
    "executor.recheck_price_up_pct": 15,
    "executor.confirm_window_min": 5,
    # risk
    "risk.poll_s": 15,
    "risk.stop_pct": 6,
    "risk.trail_start_pct": 20,
    "risk.trail_pct": 12,
    "risk.timeout_h": 3,
    "risk.timeout_min_gain_pct": 5,
    "risk.confirm_window_min": 2,
    # desk
    "desk.mode": "PAPER",
    "desk.paper_start_stack": 200,
    "desk.live_stack": 0,
    "desk.report_time": "08:00",
    "desk.notifier": "telegram",
    "desk.rpc_url": "https://api.mainnet-beta.solana.com",
    "desk.push_rejects": False,
    "desk.fees_ref_discount": 0.0,
    "desk.pump_handle": "",
    "desk.owner_chat_id": 0,
    "desk.owner_telegram_username": "",
    "desk.tz": "America/Toronto",
}

RANGES: dict[str, tuple[float, float]] = {
    "scanner.min_liquidity_usd": (1000, 5_000_000),
    "scanner.max_top10_pct": (1, 100),
    "scanner.max_h1_change_pct": (10, 1000),
    "scanner.poll_s": (15, 300),
    "scanner.min_pool_age_min": (1, 120),
    "scanner.max_wait_min": (5, 360),
    "scanner.runner_h24_pct": (50, 5000),
    "auditor.max_dev_pct": (0.1, 50),
    "auditor.max_top10_pct": (1, 100),
    "auditor.min_lp_locked_pct": (50, 100),
    "auditor.min_pool_age_min": (1, 120),
    "auditor.max_bundled": (1, 100),
    "auditor.max_delegated_accounts": (1, 100),
    "analyst.min_alive_6h": (0, 1),
    "analyst.min_organic": (0, 1),
    "analyst.max_chase": (0, 1),
    "analyst.min_score": (0, 100),
    "analyst.alive_volume_h1": (100, 10_000_000),
    "analyst.organic_buys_h1": (1, 10000),
    "analyst.flush_drop_m5_pct": (0.5, 50),
    "analyst.chase_h1_pct": (10, 500),
    "executor.stack_pct": (0.5, 50),
    "executor.max_pool_pct": (0.1, 20),
    "executor.min_ticket_usd": (5, 5000),
    "executor.recheck_liq_drop_pct": (1, 90),
    "executor.recheck_price_up_pct": (1, 200),
    "executor.confirm_window_min": (1, 30),
    "risk.poll_s": (5, 120),
    "risk.stop_pct": (1, 50),
    "risk.trail_start_pct": (5, 200),
    "risk.trail_pct": (1, 50),
    "risk.timeout_h": (0.5, 24),
    "risk.timeout_min_gain_pct": (0, 50),
    "risk.confirm_window_min": (1, 30),
    "desk.paper_start_stack": (50, 1_000_000),
    "desk.live_stack": (0, 10_000_000),
    "desk.fees_ref_discount": (0, 0.5),
}

ALIASES = {
    "stop": "risk.stop_pct",
    "trail": "risk.trail_pct",
    "trail_start": "risk.trail_start_pct",
    "stack_pct": "executor.stack_pct",
    "min_ticket": "executor.min_ticket_usd",
    "below_min": "executor.below_min",
    "mode": "desk.mode",
    "paper_start_stack": "desk.paper_start_stack",
    "rpc_url": "desk.rpc_url",
    "pump_handle": "desk.pump_handle",
    "analyst_mode": "analyst.mode",
    "fees_ref_discount": "desk.fees_ref_discount",
}

_listeners: list[Callable[[str, Any, Any], None]] = []
_state: dict[str, Any] = {}
_paused: set[str] = set()


def on_change(fn: Callable[[str, Any, Any], None]):
    _listeners.append(fn)


def _notify(key: str, old, new):
    for fn in _listeners:
        try:
            fn(key, old, new)
        except Exception:
            log.exception("config listener error")


def load_secrets() -> dict[str, str]:
    env_path = SECRETS_DIR / "env"
    out: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    # env wins for TG_TOKEN if present
    if os.environ.get("TG_TOKEN"):
        out["TG_TOKEN"] = os.environ["TG_TOKEN"]
    for k in ("APP_TOKEN", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "TG_TOKEN"):
        if k in out and out[k]:
            os.environ.setdefault(k, out[k])
    return out


def init(db=None):
    global _state
    _state = deepcopy(DEFAULTS)
    owner_raw = os.environ.get("DESK_OWNER_CHAT_ID", "").strip()
    if owner_raw != "":
        _state["desk.owner_chat_id"] = int(owner_raw)
    handle = os.environ.get("DESK_PUMP_HANDLE", "").strip()
    if handle:
        _state["desk.pump_handle"] = handle
    if db is not None:
        rows = db.all_settings()
        for k, v in rows.items():
            _state[k] = _coerce(k, v)
        # persist defaults missing from db
        for k, v in _state.items():
            if k not in rows:
                db.set_setting(k, v, who="init")
    load_secrets()
    return _state


def get(key: str, default=None):
    if key in ALIASES:
        key = ALIASES[key]
    return _state.get(key, DEFAULTS.get(key, default))


def all_settings() -> dict[str, Any]:
    return dict(_state)


def _coerce(key: str, value):
    default = DEFAULTS.get(key)
    if isinstance(default, bool):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("1", "true", "yes", "on")
        return bool(value)
    if isinstance(default, int) and not isinstance(default, bool):
        return int(float(value))
    if isinstance(default, float):
        return float(value)
    return value


def set_setting(key: str, value, who: str = "user", db=None) -> tuple[bool, str]:
    if key in ALIASES:
        key = ALIASES[key]
    if key not in DEFAULTS and not key.startswith("desk."):
        return False, f"unknown setting {key}"
    try:
        value = _coerce(key, value)
    except Exception:
        return False, f"bad value for {key}"
    if key == "desk.mode":
        value = str(value).upper()
        if value not in ("PAPER", "LIVE"):
            return False, "mode must be PAPER or LIVE"
    if key == "desk.rpc_url":
        from rpc_allowlist import validate_rpc_url
        ok_rpc, why = validate_rpc_url(str(value))
        if not ok_rpc:
            return False, why
        value = str(value).strip()
    if key == "desk.owner_chat_id":
        try:
            value = int(value)
        except (TypeError, ValueError):
            return False, "owner_chat_id must be an integer"
        if value < 0:
            return False, "owner_chat_id must be >= 0"
    if key == "executor.below_min":
        value = str(value).lower()
        if value not in ("bump", "skip"):
            return False, "below_min must be bump or skip"
    if key == "analyst.mode":
        value = str(value).lower()
        if value not in ("rules", "jev"):
            return False, "analyst.mode must be rules or jev"
    if key in RANGES:
        lo, hi = RANGES[key]
        try:
            num = float(value)
        except Exception:
            return False, f"{key} must be a number"
        if not (lo <= num <= hi):
            return False, f"{key} out of range [{lo}, {hi}]"
    old = _state.get(key)
    _state[key] = value
    if db is not None:
        db.set_setting(key, value, who=who)
        db.log_change(key, old, value, who)
    _notify(key, old, value)
    return True, f"{key} {old} -> {value}"


def ticket_check() -> dict[str, Any]:
    stack = current_stack()
    stack_pct = float(get("executor.stack_pct"))
    min_ticket = float(get("executor.min_ticket_usd"))
    below = get("executor.below_min")
    min_stack = min_ticket / (stack_pct / 100.0)
    out = {
        "stack": stack,
        "min_stack": round(min_stack, 2),
        "min_ticket": min_ticket,
        "stack_pct": stack_pct,
        "below_min": below,
        "ok": True,
        "message": None,
    }
    if stack < min_stack:
        if below == "bump":
            pct = (min_ticket / stack) * 100 if stack > 0 else 0
            out["message"] = f"tickets bumped to ${min_ticket:.2f} = {pct:.1f}% of stack"
        else:
            out["ok"] = False
            out["message"] = (
                f"every coin will be skipped, stack under ${min_stack:.2f}"
            )
    return out


def current_stack() -> float:
    mode = str(get("desk.mode")).upper()
    if mode == "LIVE":
        return float(get("desk.live_stack") or 0)
    # PAPER uses simulated balance from db if available; fallback start stack
    return float(get("desk._paper_balance", get("desk.paper_start_stack")))


def set_paper_balance(v: float):
    _state["desk._paper_balance"] = float(v)


def is_paused(agent: str) -> bool:
    return agent.lower() in _paused


def pause(agent: str):
    _paused.add(agent.lower())


def resume(agent: str):
    _paused.discard(agent.lower())


def paused_agents() -> list[str]:
    return sorted(_paused)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
