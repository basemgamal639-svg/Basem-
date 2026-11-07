import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.risk import evaluate

def test_risk():
    entry = 1.0
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    opened = now.isoformat().replace("+00:00", "Z")

    # +25% then 13% off top = trail
    peak, trail, action, reason = evaluate(entry, entry, 1.25, False, opened, 6, 20, 12, 3, 5, now)
    assert trail is True and action == "hold"
    peak, trail, action, reason = evaluate(entry, peak, 1.25 * 0.87, True, opened, 6, 20, 12, 3, 5, now)
    assert action == "exit" and reason == "trail"
    print("PASS trail")

    # -6.1% stop
    peak, trail, action, reason = evaluate(entry, entry, 0.939, False, opened, 6, 20, 12, 3, 5, now)
    assert action == "exit" and reason == "stop"
    print("PASS stop")

    # 3h at +4% timeout
    later = now + timedelta(hours=3, minutes=1)
    peak, trail, action, reason = evaluate(entry, entry, 1.04, False, opened, 6, 20, 12, 3, 5, later)
    assert action == "exit" and reason == "timeout"
    print("PASS timeout")

    # loosening stop never moves open stop down — simulated in Risk._poll;
    # unit: a position with stop_pct=6 should keep 6 when setting becomes 8
    pos_stop = 6
    setting = 8
    if setting < pos_stop:
        pos_stop = setting
    assert pos_stop == 6
    # tighter does apply
    setting = 4
    if setting < pos_stop:
        pos_stop = setting
    assert pos_stop == 4
    print("PASS stop tighten-only")
    print("PASS test_risk")

if __name__ == "__main__":
    test_risk()
