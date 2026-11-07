"""Trading fee model for PAPER PnL. Gas = 0."""
from __future__ import annotations


def fee_one_side(ticket_usd: float, ref_discount: float = 0.0) -> float:
    """Fee for one side (buy or sell), then apply ref discount."""
    t = float(ticket_usd)
    if t < 5:
        raw = 0.0
    elif t <= 47.50:
        raw = 0.02 * t
    elif t <= 190:
        raw = 0.95
    else:
        raw = 0.005 * t
    disc = max(0.0, min(1.0, float(ref_discount or 0.0)))
    return round(raw * (1.0 - disc), 6)


def round_trip_fees(ticket_usd: float, ref_discount: float = 0.0) -> float:
    return round(fee_one_side(ticket_usd, ref_discount) * 2, 6)
