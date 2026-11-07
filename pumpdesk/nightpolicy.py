"""Paper-night completion. Heartbeats do not count. No real overnight is claimed."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

# Production thresholds. Tests inject a clock; they do not wait this long.
MIN_UPTIME_S = 6 * 3600
MAX_GAP_S = 300
MIN_INGESTED_SCANS = (MIN_UPTIME_S // MAX_GAP_S) + 1
MAX_CLOCK_SKEW_S = 120

_boot_id = uuid.uuid4().hex
_night_id: int | None = None
_clock = None


def boot_id() -> str:
    return _boot_id


def set_clock(fn):
    global _clock
    _clock = fn


def _now():
    if _clock:
        return _clock()
    return datetime.now(timezone.utc), time.monotonic()


def bind_night(night_id: int | None):
    global _night_id
    _night_id = night_id


def note_scan(db) -> None:
    """Call only when a scan row is actually inserted. Heartbeats must not call this."""
    if _night_id is None:
        return
    wall, mono = _now()
    wall_s = wall.timestamp() if isinstance(wall, datetime) else float(wall)
    mono_s = float(mono)
    seg = db.night_segment(_night_id, _boot_id)
    if seg is None:
        db.insert_night_segment(_night_id, _boot_id, wall_s, mono_s)
        return
    gap = int(wall_s - float(seg["last_wall"]))
    broken = int(seg["broken"])
    if mono_s + MAX_CLOCK_SKEW_S < float(seg["last_mono"]) or gap < -MAX_CLOCK_SKEW_S or gap > MAX_GAP_S:
        broken = 1
    scans = int(seg["scans"]) + (0 if broken else 1)
    max_gap = max(int(seg["max_gap_s"]), max(gap, 0))
    db.update_night_segment(_night_id, _boot_id, wall_s, mono_s, scans, max_gap, broken)


def evaluate(db, night_id: int) -> tuple[bool, str]:
    seg = db.night_segment(night_id, _boot_id)
    if not seg:
        return False, "no ingestion segment for this process boot"
    if seg["broken"]:
        return False, "continuity broken by a gap, restart, or clock step"
    uptime = float(seg["last_mono"]) - float(seg["start_mono"])
    if uptime < MIN_UPTIME_S:
        return False, "observed continuous uptime is below the policy"
    if int(seg["scans"]) < MIN_INGESTED_SCANS:
        return False, "ingested scan coverage is below the policy"
    if int(seg["max_gap_s"]) > MAX_GAP_S:
        return False, "gap between ingested scans is too large"
    return True, "policy met on an injected or observed timeline; not a claim that a real night ran"


def reset_for_tests():
    global _boot_id, _night_id, _clock
    _boot_id = uuid.uuid4().hex
    _night_id = None
    _clock = None
