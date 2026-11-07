import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from agents.analyst import apply_gate, rules_answers

def test_gate_thresholds():
    config.init()
    # each reject
    cases = [
        {"alive_6h": 0.69, "organic": 0.80, "flush": 1.0, "chase": 0.20},
        {"alive_6h": 0.80, "organic": 0.64, "flush": 1.0, "chase": 0.20},
        {"alive_6h": 0.80, "organic": 0.80, "flush": 1.0, "chase": 0.31},
        {"alive_6h": 0.70, "organic": 0.65, "flush": 0.71, "chase": 0.30},  # score 69
    ]
    for a in cases[:3]:
        ok, score, failed = apply_gate(a)
        assert not ok, a
        print("reject ok", failed)
    # score 69 reject
    a = {"alive_6h": 0.70, "organic": 0.65, "flush": 0.71, "chase": 0.30}
    ok, score, failed = apply_gate(a)
    assert score == 69
    assert not ok
    assert any("score" in f for f in failed)
    # all at threshold pass (flush 1 to lift score)
    a = {"alive_6h": 0.70, "organic": 0.65, "flush": 1.0, "chase": 0.30}
    ok, score, failed = apply_gate(a)
    assert ok, (score, failed)
    assert score >= 70
    print("PASS thresholds score", score)

def test_rules_mode():
    config.init()
    # fake dex: high volume, many buys, flush, low chase
    dex = {
        "volume": {"h1": 25000},
        "txns": {"h1": {"buys": 150}, "m5": {"buys": 10, "sells": 5}},
        "priceChange": {"m5": -6, "h1": 10},
    }
    ans = rules_answers(dex, bundled_count=0)
    ok, score, failed = apply_gate(ans)
    assert ans["alive_6h"] == 1.0
    assert ans["organic"] == 1.0
    assert ans["flush"] == 1.0
    assert abs(ans["chase"] - 10/80) < 1e-9
    assert ok
    print("PASS rules mode", ans, score, "Analyst (rules)")
    # bundled penalty
    ans2 = rules_answers(dex, bundled_count=3)
    assert ans2["organic"] == 0.5
    print("PASS bundled penalty")

if __name__ == "__main__":
    test_gate_thresholds()
    test_rules_mode()
    print("PASS test_gate")
