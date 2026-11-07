"""Notifier: Telegram (+ optional web push). Buttons carry exact links.py URLs."""
from __future__ import annotations

import logging
import os
from typing import Any

import config
from links import coin_url

log = logging.getLogger("notifier")


class Notifier:
    def __init__(self, telegram=None, webpush=None, db=None):
        self.telegram = telegram
        self.webpush = webpush
        self.db = db

    async def send(
        self,
        text: str,
        *,
        mint: str | None = None,
        buttons: list[dict] | None = None,
        paper: bool | None = None,
    ):
        mode = str(config.get("desk.mode") or "PAPER").upper()
        if paper is None:
            paper = mode == "PAPER"
        if paper and not text.startswith("PAPER"):
            text = f"PAPER · {text}"
        # Ensure any coin button uses links.py
        fixed = []
        for b in buttons or []:
            b = dict(b)
            if b.get("kind") == "url" and mint and not b.get("url"):
                b["url"] = coin_url(mint, "solana")
            fixed.append(b)
        if self.db is not None:
            self.db.enqueue_notification("desk", text)
        channel = config.get("desk.notifier") or "telegram"
        deliver = os.environ.get("NOTIFY_DELIVER", "1") == "1"
        if channel == "telegram" and self.telegram and deliver:
            await self.telegram.send(text, buttons=fixed)
        if self.webpush and mint:
            try:
                await self.webpush.send(text, url=coin_url(mint, "solana"))
            except Exception:
                log.exception("webpush failed")

    async def buy_push(self, name, mint, size, pct, score, stop_pct, trail_pct):
        text = (
            f"Buy {name} · ${size:.2f} · {pct:.1f}% of stack\n"
            f"Auditor 8/8 · Analyst {score} · stop -{stop_pct:g}% · trail {trail_pct:g}%"
        )
        buttons = [
            {"kind": "url", "text": "Buy on Pump.fun", "url": coin_url(mint, "solana")},
            {"kind": "callback", "text": "Bought", "data": f"bought:{mint}"},
            {"kind": "callback", "text": "Skip", "data": f"skip:{mint}"},
        ]
        await self.send(text, mint=mint, buttons=buttons)

    async def sell_push(self, text: str, mint: str, extra_callback: str = "sold"):
        buttons = [
            {"kind": "url", "text": "Sell on Pump.fun", "url": coin_url(mint, "solana")},
            {"kind": "callback", "text": "Sold", "data": f"{extra_callback}:{mint}"},
        ]
        await self.send(text, mint=mint, buttons=buttons)
