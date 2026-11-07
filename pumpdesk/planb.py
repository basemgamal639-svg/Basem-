"""Plan B: write pollable JSON under web/d/{DATA_PATH}/ (secret path, no listing)."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import config
from links import SIGNUP_URL, coin_url, profile_url

ROOT = Path(__file__).resolve().parent


class PlanBWriter:
    def __init__(self, db, bus):
        self.db = db
        self.bus = bus
        self.data_path = os.environ.get("DATA_PATH", "")
        self.root = ROOT / "web" / "d" / self.data_path if self.data_path else None

    def enabled(self) -> bool:
        return bool(self.data_path)

    def ensure(self):
        return

    async def run(self):
        return

    async def write_all(self):
        return
