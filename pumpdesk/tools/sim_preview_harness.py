"""Print one simulated preview. No network, no keys, no broadcast."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from simpreview import BANNER, create_preview, SimStore


def main() -> None:
    row = create_preview(
        SimStore(),
        {
            "cluster": "devnet",
            "mint": "So11111111111111111111111111111111111111112",
            "name": "Example",
            "symbol": "EX",
            "decimals": 9,
            "side": "buy",
            "amount_base": 1,
            "destination": "11111111111111111111111111111111",
            "max_lamports_in": 1,
            "min_amount_out": 1,
            "slippage_bps": 0,
            "fee_lamports_ceiling": 0,
        },
        None,
    )
    print(BANNER)
    print("executable", row["executable"])
    print("broadcast_enabled", row["broadcast_enabled"])
    print("message_sha256", row["message_sha256"])


if __name__ == "__main__":
    main()
