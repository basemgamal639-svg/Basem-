import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from agents.executor import compute_size

def test_executor():
    config.init()
    # stack 200 -> 8% = 16 -> under 47.50 -> bump
    def get_bump(k, default=None):
        d = {
            "executor.stack_pct": 8,
            "executor.max_pool_pct": 2,
            "executor.min_ticket_usd": 47.50,
            "executor.below_min": "bump",
        }
        return d.get(k, config.get(k, default))
    size, skip, cap = compute_size(200, 200, 1_000_000, get_bump)
    assert skip is None and size == 47.50 and cap == "bump"
    print("PASS bump", size)

    def get_skip(k, default=None):
        d = {
            "executor.stack_pct": 8,
            "executor.max_pool_pct": 2,
            "executor.min_ticket_usd": 47.50,
            "executor.below_min": "skip",
        }
        return d.get(k, config.get(k, default))
    size, skip, cap = compute_size(200, 200, 1_000_000, get_skip)
    assert size == 0 and skip == "under $47.50"
    print("PASS skip", skip)

    # ticket warning path
    config.set_setting("executor.below_min", "skip", who="test")
    config.set_paper_balance(200)
    # force paper stack
    config._state["desk.mode"] = "PAPER"
    config._state["desk.paper_start_stack"] = 200
    config._state["desk._paper_balance"] = 200
    tc = config.ticket_check()
    assert not tc["ok"]
    assert "every coin will be skipped" in tc["message"]
    print("PASS warning", tc["message"])

    # pool liq 40k caps at 800
    def get_big(k, default=None):
        d = {
            "executor.stack_pct": 50,
            "executor.max_pool_pct": 2,
            "executor.min_ticket_usd": 47.50,
            "executor.below_min": "bump",
        }
        return d.get(k, config.get(k, default))
    size, skip, cap = compute_size(100_000, 100_000, 40_000, get_big)
    assert size == 800.0 and cap == "pool"
    print("PASS pool cap", size)
    print("PASS test_executor")

if __name__ == "__main__":
    test_executor()
