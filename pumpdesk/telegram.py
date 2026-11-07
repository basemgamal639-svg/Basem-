"""Telegram long polling, owner-only. Commands from STEP 9 (Pump.fun copy)."""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Callable, Awaitable

import httpx

import config
from links import SIGNUP_URL, coin_url, profile_url

log = logging.getLogger("telegram")

API = "https://api.telegram.org"


class Telegram:
    def __init__(self, db, bus, handlers: dict[str, Callable[..., Awaitable]] | None = None):
        self.db = db
        self.bus = bus
        self.token = os.environ.get("TG_TOKEN", "")
        self.owner_id = int(config.get("desk.owner_chat_id") or 0)
        self.handlers = handlers or {}
        self._offset = 0
        self._client: httpx.AsyncClient | None = None
        self.on_callback: Callable[[str, str], Awaitable] | None = None
        self.on_command: Callable[[str, str], Awaitable[str]] | None = None
        self.last_poll_ok_at: float | None = None
        self.last_delivery_at: float | None = None
        self.night_id: int | None = None

    @property
    def ok(self) -> bool:
        return bool(self.token)

    def _url(self, method: str) -> str:
        return f"{API}/bot{self.token}/{method}"

    async def start(self):
        if not self.token:
            log.warning("TG_TOKEN missing — Telegram disabled")
            return
        self._client = httpx.AsyncClient(timeout=60.0)
        asyncio.create_task(self._poll_loop())

    async def stop(self):
        if self._client:
            await self._client.aclose()

    async def send(self, text: str, buttons: list[dict] | None = None, chat_id: int | None = None):
        if not self._client or not self.token:
            return
        chat_id = chat_id or self.owner_id
        if not chat_id:
            return
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": False,
        }
        if buttons:
            inline = []
            row = []
            for b in buttons:
                if b.get("kind") == "url":
                    row.append({"text": b["text"], "url": b["url"]})
                elif b.get("kind") == "callback":
                    row.append({"text": b["text"], "callback_data": b["data"][:64]})
                if len(row) >= 2:
                    inline.append(row)
                    row = []
            if row:
                inline.append(row)
            payload["reply_markup"] = {"inline_keyboard": inline}
        for attempt in range(3):
            try:
                r = await self._client.post(self._url("sendMessage"), json=payload)
                if r.status_code == 200:
                    self.last_delivery_at = asyncio.get_event_loop().time()
                    return
                log.warning("telegram send status %s", r.status_code)
            except Exception:
                log.exception("telegram send attempt %s", attempt + 1)
            await asyncio.sleep(1)

    async def _poll_loop(self):
        assert self._client
        while True:
            try:
                r = await self._client.get(
                    self._url("getUpdates"),
                    params={"timeout": 50, "offset": self._offset},
                )
                if r.status_code != 200:
                    await asyncio.sleep(2)
                    continue
                self.last_poll_ok_at = asyncio.get_event_loop().time()
                data = r.json()
                for upd in data.get("result") or []:
                    self._offset = max(self._offset, int(upd["update_id"]) + 1)
                    await self._handle(upd)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("telegram poll")
                await asyncio.sleep(3)

    async def _handle(self, upd: dict):
        if "callback_query" in upd:
            cq = upd["callback_query"]
            from_id = int(((cq.get("from") or {}).get("id")) or 0)
            if self.owner_id and from_id != self.owner_id:
                return
            data = cq.get("data") or ""
            if self.on_callback:
                await self.on_callback(data, str(from_id))
            try:
                await self._client.post(
                    self._url("answerCallbackQuery"),
                    json={"callback_query_id": cq["id"]},
                )
            except Exception:
                pass
            return

        msg = upd.get("message") or upd.get("edited_message")
        if not msg:
            return
        from_id = int(((msg.get("from") or {}).get("id")) or 0)
        chat_id = int(((msg.get("chat") or {}).get("id")) or 0)
        text = (msg.get("text") or "").strip()
        if not text:
            return

        # Owner must be configured ahead of time. Never claim the first /start.
        if not self.owner_id:
            log.info("telegram ignored: owner_chat_id is unset")
            return
        if from_id != self.owner_id:
            log.info("ignored non-owner chat")
            return

        reply = await self._dispatch(text)
        if reply:
            await self.send(reply, chat_id=chat_id)

    async def _dispatch(self, text: str) -> str:
        raw = text.strip()
        low = raw.lower()
        if low in ("/start", "start"):
            return "Desk online. Commands: status, buy X, sell X, why X, pause/resume Agent, set …, stack N, paper|live, invite, report"
        if low in ("invite", "/invite"):
            return f"Invite: {SIGNUP_URL}"
        if low in ("status", "/status"):
            return await self._status()
        if low in ("paper", "/paper"):
            ok, msg = config.set_setting("desk.mode", "PAPER", who="telegram", db=self.db)
            return msg
        if low == "live":
            return "Type LIVE to confirm switching to LIVE mode."
        if raw.strip() == "LIVE":
            return "LIVE is unavailable. Mainnet sending cannot be enabled."
        m = re.match(r"(?i)^stack\s+(\d+(?:\.\d+)?)$", raw)
        if m:
            ok, msg = config.set_setting("desk.live_stack", float(m.group(1)), who="telegram", db=self.db)
            return msg
        m = re.match(r"(?i)^pause\s+(\w+)$", raw)
        if m:
            agent = m.group(1)
            if agent.lower() == "risk" and self.db.open_positions():
                return "Can't pause Risk while a position is open."
            config.pause(agent)
            return f"Paused {agent}"
        m = re.match(r"(?i)^resume\s+(\w+)$", raw)
        if m:
            config.resume(m.group(1))
            return f"Resumed {m.group(1)}"
        m = re.match(r"(?i)^set\s+(.+?)\s+to\s+(.+)$", raw)
        if m:
            return self._set(m.group(1).strip(), m.group(2).strip())
        m = re.match(r"(?i)^(?:buy|sell|why)\s+(.+)$", raw)
        if m and self.on_command:
            return await self.on_command(low.split()[0], m.group(1).strip())
        if self.on_command and low.startswith(("buy ", "sell ", "why ")):
            parts = raw.split(None, 1)
            return await self.on_command(parts[0].lower(), parts[1])
        if low in ("complete night", "/complete_night"):
            night_id = getattr(self, "night_id", None)
            if not night_id:
                return "No open night id is attached to this process."
            ok, msg = self.db.complete_paper_night(int(night_id), who="telegram-owner")
            return msg if ok else f"Refuse: {msg}"
        if low in ("report", "/report"):
            return "Morning Page not generated yet (routines come later)."
        # unknown
        return (
            "Commands:\n"
            "buy X · sell X · why X\n"
            "pause/resume Scanner|Auditor|Analyst|Executor|Risk\n"
            "set stop to -8% · stack 1240\n"
            "status · paper · LIVE · invite · report"
        )

    def _set(self, name: str, value: str) -> str:
        key = name.lower().replace(" ", "_")
        # "stop" / "-8%" style
        v = value.strip()
        if v.endswith("%"):
            v = v[:-1]
        if v.startswith("-") and key in ("stop", "risk.stop_pct"):
            v = v[1:]
        ok, msg = config.set_setting(key, v, who="telegram", db=self.db)
        return msg if ok else f"Refuse: {msg}"

    async def _status(self) -> str:
        mode = config.get("desk.mode")
        bal = self.db.latest_balance()
        if bal is None:
            bal = config.current_stack()
        lines = [f"Mode {mode}", f"Balance ${bal:.2f}"]
        opens = self.db.open_positions()
        if not opens:
            lines.append("No open positions")
        for p in opens:
            link = coin_url(p["mint"], "solana")
            lines.append(
                f"{p.get('name') or p['mint'][:8]} · entry ${p['entry_price']:.6g} · "
                f"${p['size_usd']:.2f}\n{link}"
            )
        return "\n".join(lines)
