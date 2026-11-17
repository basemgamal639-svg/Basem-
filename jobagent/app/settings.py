"""Loads config.yaml, profile.yaml and .env into one Ctx object shared by every module."""
from __future__ import annotations
import os, random, time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Ctx:
    cfg: dict
    profile: dict
    SessionLocal: Any
    http: Any
    llm: Any = None            # object with .json(system, user) -> dict | None
    mailer: Any = None         # object with .send(...), .get_thread(...), .my_address, .is_real
    sources: list = field(default_factory=list)
    now_fn: Callable[[], datetime] = None
    sleep_fn: Callable[[float], None] = time.sleep
    rand: random.Random = field(default_factory=random.Random)
    root: Path = ROOT

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.cfg.get("timezone", "America/Toronto"))

    def now(self) -> datetime:
        """Timezone-aware 'now' in the user's timezone."""
        return self.now_fn() if self.now_fn else datetime.now(self.tz)

    @contextmanager
    def session(self):
        s = self.SessionLocal()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()


def load_yaml(name: str) -> dict:
    return yaml.safe_load((ROOT / name).read_text()) or {}


def build_ctx(*, force_mailer: str | None = None) -> Ctx:
    from . import db, http as httpmod, llm as llmmod, mailer as mailermod, sources as srcmod
    load_dotenv(ROOT / ".env")
    cfg, profile = load_yaml("config.yaml"), load_yaml("profile.yaml")
    url = os.getenv("DATABASE_URL", "sqlite:///data/jobagent.db")
    if url.startswith("sqlite:///") and not url.startswith("sqlite:////"):
        (ROOT / "data").mkdir(exist_ok=True)
        url = "sqlite:///" + str(ROOT / url[len("sqlite:///"):])
    ctx = Ctx(cfg=cfg, profile=profile, SessionLocal=db.make_session_factory(url), http=httpmod.Http())
    ctx.llm = llmmod.make_llm()
    ctx.mailer = mailermod.make_mailer(ctx, force_mailer or os.getenv("MAILER", "dryrun"))
    ctx.sources = srcmod.build_sources(ctx)
    return ctx
