"""SQLite WAL schema + helpers."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from config import DATA_DIR, now_iso


def _utc() -> str:
    return now_iso()


class DB:
    def __init__(self, path: Path | None = None):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.path = path or (DATA_DIR / "desk.db")
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._migrate()

    def close(self):
        with self._lock:
            self._conn.close()

    @contextmanager
    def cursor(self):
        with self._lock:
            cur = self._conn.cursor()
            try:
                yield cur
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def _migrate(self):
        with self.cursor() as cur:
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS coins (
                  mint TEXT PRIMARY KEY,
                  name TEXT,
                  symbol TEXT,
                  pool TEXT,
                  migrated_at TEXT,
                  creator TEXT,
                  creator_balance_at_migration REAL,
                  holders INTEGER,
                  night TEXT
                );
                CREATE TABLE IF NOT EXISTS scans (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT,
                  liquidity_usd REAL, top10_pct REAL, h1_change_pct REAL,
                  age_min INTEGER, verdict TEXT, reason TEXT,
                  name TEXT, symbol TEXT, pool TEXT
                );
                CREATE TABLE IF NOT EXISTS audits (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, layer INTEGER, name TEXT,
                  value_text TEXT, pass INTEGER, source TEXT
                );
                CREATE TABLE IF NOT EXISTS audit_runs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, passed INTEGER, layers_checked INTEGER,
                  holders INTEGER, reason TEXT, payload TEXT
                );
                CREATE TABLE IF NOT EXISTS verdicts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT,
                  alive_6h REAL, organic REAL, flush REAL, chase REAL,
                  score INTEGER, pass INTEGER, reason TEXT, input_tokens INTEGER,
                  model TEXT, payload TEXT
                );
                CREATE TABLE IF NOT EXISTS signals (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, ts TEXT, price REAL, size_usd REAL, stack_pct REAL,
                  link TEXT, mode TEXT, status TEXT, reason TEXT, name TEXT, symbol TEXT
                );
                CREATE TABLE IF NOT EXISTS positions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  mint TEXT, name TEXT, symbol TEXT,
                  opened_at TEXT, entry_price REAL, size_usd REAL,
                  peak_price REAL, stop_price REAL, stop_pct REAL,
                  trail_active INTEGER DEFAULT 0, trail_pct REAL,
                  closed_at TEXT, exit_price REAL, exit_reason TEXT,
                  pnl_usd REAL, fees_usd REAL, mode TEXT, status TEXT
                );
                CREATE TABLE IF NOT EXISTS activity (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ts TEXT, kind TEXT, mint TEXT, agent TEXT,
                  title TEXT, subtitle TEXT, value TEXT, meta TEXT
                );
                CREATE TABLE IF NOT EXISTS prices (
                  mint TEXT, ts TEXT, price REAL, volume_m5 REAL
                );
                CREATE INDEX IF NOT EXISTS idx_prices_mint_ts ON prices(mint, ts);
                CREATE TABLE IF NOT EXISTS balance (
                  ts TEXT, value REAL
                );
                CREATE TABLE IF NOT EXISTS settings (
                  key TEXT PRIMARY KEY, value TEXT, updated_at TEXT
                );
                CREATE TABLE IF NOT EXISTS change_log (
                  ts TEXT, key TEXT, old TEXT, new TEXT, who TEXT
                );
                CREATE TABLE IF NOT EXISTS skips (
                  mint TEXT PRIMARY KEY, until TEXT
                );
                CREATE TABLE IF NOT EXISTS heartbeats (
                  agent TEXT PRIMARY KEY, ts TEXT
                );
                CREATE TABLE IF NOT EXISTS push_subs (
                  endpoint TEXT PRIMARY KEY, p256dh TEXT, auth TEXT, created_at TEXT
                );
                CREATE TABLE IF NOT EXISTS waiting_room (
                  mint TEXT PRIMARY KEY,
                  name TEXT, symbol TEXT, pool TEXT,
                  migrated_at TEXT, creator TEXT,
                  creator_balance REAL,
                  scanner_liq REAL, scanner_price REAL,
                  passed INTEGER DEFAULT 0,
                  killed INTEGER DEFAULT 0,
                  reason TEXT,
                  night TEXT
                );
                CREATE TABLE IF NOT EXISTS nights (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  started_at TEXT, ended_at TEXT, mode TEXT, full INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS rejected_mints (
                  mint TEXT, night TEXT, agent TEXT,
                  PRIMARY KEY (mint, night)
                );
                CREATE TABLE IF NOT EXISTS runners (
                  mint TEXT, name TEXT, symbol TEXT, night TEXT, h24 REAL
                );
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version INTEGER PRIMARY KEY,
                  applied_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS intents (
                  id TEXT PRIMARY KEY,
                  created_at TEXT,
                  wallet TEXT,
                  cluster TEXT,
                  message_sha256 TEXT,
                  canonical TEXT,
                  status TEXT,
                  signature_hex TEXT,
                  executable INTEGER DEFAULT 0,
                  expires_at TEXT,
                  max_lamports_in INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS wallet_sessions (
                  id_hash TEXT PRIMARY KEY,
                  wallet TEXT,
                  cluster TEXT,
                  csrf TEXT,
                  created_at TEXT,
                  expires_at TEXT
                );
                CREATE TABLE IF NOT EXISTS login_nonces (
                  nonce TEXT PRIMARY KEY,
                  wallet TEXT,
                  cluster TEXT,
                  domain TEXT,
                  message TEXT,
                  expires_at TEXT,
                  used INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS notification_outbox (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  created_at TEXT,
                  kind TEXT,
                  body TEXT,
                  status TEXT
                );
                CREATE TABLE IF NOT EXISTS settings_quarantine (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  key TEXT,
                  value TEXT,
                  reason TEXT,
                  quarantined_at TEXT
                );
                CREATE TABLE IF NOT EXISTS night_segments (
                  night_id INTEGER,
                  boot_id TEXT,
                  start_wall REAL,
                  last_wall REAL,
                  start_mono REAL,
                  last_mono REAL,
                  scans INTEGER,
                  max_gap_s INTEGER,
                  broken INTEGER,
                  PRIMARY KEY (night_id, boot_id)
                );
                """
            )
            cur.execute("SELECT version FROM schema_migrations")
            have = {row[0] for row in cur.fetchall()}
            if 2 not in have:
                cur.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)",
                    (_utc(),),
                )

    # ---- settings ----
    def all_settings(self) -> dict[str, Any]:
        with self.cursor() as cur:
            cur.execute("SELECT key, value FROM settings")
            out = {}
            for r in cur.fetchall():
                try:
                    out[r["key"]] = json.loads(r["value"])
                except Exception:
                    out[r["key"]] = r["value"]
            return out

    def set_setting(self, key: str, value, who: str = "system"):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (key, json.dumps(value), _utc()),
            )

    def log_change(self, key, old, new, who):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO change_log(ts,key,old,new,who) VALUES(?,?,?,?,?)",
                (_utc(), key, json.dumps(old), json.dumps(new), who),
            )

    # ---- heartbeats ----
    def heartbeat(self, agent: str):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO heartbeats(agent,ts) VALUES(?,?) "
                "ON CONFLICT(agent) DO UPDATE SET ts=excluded.ts",
                (agent, _utc()),
            )

    def all_heartbeats(self) -> dict[str, str]:
        with self.cursor() as cur:
            cur.execute("SELECT agent, ts FROM heartbeats")
            return {r["agent"]: r["ts"] for r in cur.fetchall()}

    # ---- coins / waiting ----
    def upsert_coin(self, **kw):
        cols = [
            "mint", "name", "symbol", "pool", "migrated_at", "creator",
            "creator_balance_at_migration", "holders", "night",
        ]
        vals = [kw.get(c) for c in cols]
        with self.cursor() as cur:
            cur.execute(
                f"INSERT INTO coins({','.join(cols)}) VALUES({','.join('?'*len(cols))}) "
                "ON CONFLICT(mint) DO UPDATE SET "
                "name=COALESCE(excluded.name,coins.name),"
                "symbol=COALESCE(excluded.symbol,coins.symbol),"
                "pool=COALESCE(excluded.pool,coins.pool),"
                "creator=COALESCE(excluded.creator,coins.creator),"
                "creator_balance_at_migration=COALESCE(excluded.creator_balance_at_migration,coins.creator_balance_at_migration),"
                "holders=COALESCE(excluded.holders,coins.holders)",
                vals,
            )

    def get_coin(self, mint: str):
        with self.cursor() as cur:
            cur.execute("SELECT * FROM coins WHERE mint=?", (mint,))
            r = cur.fetchone()
            return dict(r) if r else None

    def find_coins(self, q: str) -> list[dict]:
        q = (q or "").strip()
        if not q:
            return []
        with self.cursor() as cur:
            cur.execute(
                "SELECT * FROM coins WHERE mint=? OR lower(name)=lower(?) OR lower(symbol)=lower(?) "
                "OR lower(name) LIKE lower(?) OR lower(symbol) LIKE lower(?) LIMIT 10",
                (q, q, q, f"%{q}%", f"%{q}%"),
            )
            return [dict(r) for r in cur.fetchall()]

    def waiting_add(self, **kw):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO waiting_room(mint,name,symbol,pool,migrated_at,creator,"
                "creator_balance,scanner_liq,scanner_price,night) "
                "VALUES(?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(mint) DO NOTHING",
                (
                    kw.get("mint"), kw.get("name"), kw.get("symbol"), kw.get("pool"),
                    kw.get("migrated_at"), kw.get("creator"), kw.get("creator_balance"),
                    kw.get("scanner_liq"), kw.get("scanner_price"), kw.get("night"),
                ),
            )

    def waiting_list(self, active_only=True) -> list[dict]:
        with self.cursor() as cur:
            if active_only:
                cur.execute(
                    "SELECT * FROM waiting_room WHERE passed=0 AND killed=0"
                )
            else:
                cur.execute("SELECT * FROM waiting_room")
            return [dict(r) for r in cur.fetchall()]

    def waiting_update(self, mint: str, **kw):
        if not kw:
            return
        sets = ", ".join(f"{k}=?" for k in kw)
        with self.cursor() as cur:
            cur.execute(
                f"UPDATE waiting_room SET {sets} WHERE mint=?",
                (*kw.values(), mint),
            )

    def waiting_get(self, mint: str):
        with self.cursor() as cur:
            cur.execute("SELECT * FROM waiting_room WHERE mint=?", (mint,))
            r = cur.fetchone()
            return dict(r) if r else None

    # ---- scans / audits / verdicts ----
    def add_scan(self, d: dict):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO scans(mint,ts,liquidity_usd,top10_pct,h1_change_pct,age_min,"
                "verdict,reason,name,symbol,pool) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    d.get("mint"), d.get("ts"), d.get("liquidityUsd"), d.get("top10Pct"),
                    d.get("h1ChangePct"), d.get("ageMin"), d.get("verdict"), d.get("reason"),
                    d.get("name"), d.get("symbol"), d.get("pool"),
                ),
            )
        import nightpolicy
        nightpolicy.note_scan(self)

    def recent_scans(self, limit=20) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM scans ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]

    def add_audit_layer(self, mint, layer, name, value_text, passed, source):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO audits(mint,ts,layer,name,value_text,pass,source) "
                "VALUES(?,?,?,?,?,?,?)",
                (_utc(),) if False else (
                    mint, _utc(), layer, name, value_text, 1 if passed else 0, source
                ),
            )

    def add_audit_run(self, d: dict):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_runs(mint,ts,passed,layers_checked,holders,reason,payload) "
                "VALUES(?,?,?,?,?,?,?)",
                (
                    d.get("mint"), d.get("ts"), 1 if d.get("passed") else 0,
                    d.get("layersChecked"), d.get("holders"), d.get("reason"),
                    json.dumps(d),
                ),
            )

    def get_audit(self, mint: str) -> dict | None:
        with self.cursor() as cur:
            cur.execute(
                "SELECT payload FROM audit_runs WHERE mint=? ORDER BY id DESC LIMIT 1",
                (mint,),
            )
            r = cur.fetchone()
            if not r:
                return None
            return json.loads(r["payload"])

    def recent_audits(self, limit=20) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT payload FROM audit_runs ORDER BY id DESC LIMIT ?", (limit,))
            return [json.loads(r["payload"]) for r in cur.fetchall()]

    def add_verdict(self, d: dict):
        with self.cursor() as cur:
            ans = d.get("answers") or {}
            cur.execute(
                "INSERT INTO verdicts(mint,ts,alive_6h,organic,flush,chase,score,pass,"
                "reason,input_tokens,model,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    d.get("mint"), d.get("ts"), ans.get("alive_6h"), ans.get("organic"),
                    ans.get("flush"), ans.get("chase"), d.get("score"),
                    1 if d.get("passed") else 0,
                    (d.get("failed") or [None])[0] if d.get("failed") else None,
                    d.get("inputTokens"), d.get("model"), json.dumps(d),
                ),
            )

    def recent_verdicts(self, limit=20) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT payload FROM verdicts ORDER BY id DESC LIMIT ?", (limit,))
            return [json.loads(r["payload"]) for r in cur.fetchall()]

    # ---- signals / positions ----
    def add_signal(self, d: dict) -> int:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO signals(mint,ts,price,size_usd,stack_pct,link,mode,status,reason,name,symbol) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    d.get("mint"), d.get("ts"), d.get("signalPrice"), d.get("sizeUsd"),
                    d.get("stackPct"), d.get("link"), d.get("mode"), d.get("status"),
                    d.get("reason"), d.get("name"), d.get("symbol"),
                ),
            )
            return cur.lastrowid

    def update_signal(self, mint: str, status: str, reason=None):
        with self.cursor() as cur:
            cur.execute(
                "UPDATE signals SET status=?, reason=COALESCE(?,reason) WHERE id=("
                "SELECT id FROM signals WHERE mint=? ORDER BY id DESC LIMIT 1)",
                (status, reason, mint),
            )

    def recent_signals(self, limit=20) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM signals ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]

    def open_positions(self) -> list[dict]:
        with self.cursor() as cur:
            cur.execute(
                "SELECT * FROM positions WHERE status IN ('open','exiting') ORDER BY id"
            )
            return [dict(r) for r in cur.fetchall()]

    def get_position(self, mint: str):
        with self.cursor() as cur:
            cur.execute(
                "SELECT * FROM positions WHERE mint=? AND status IN ('open','exiting') "
                "ORDER BY id DESC LIMIT 1",
                (mint,),
            )
            r = cur.fetchone()
            return dict(r) if r else None

    def add_position(self, d: dict) -> int:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO positions(mint,name,symbol,opened_at,entry_price,size_usd,"
                "peak_price,stop_price,stop_pct,trail_active,trail_pct,mode,status) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    d.get("mint"), d.get("name"), d.get("symbol"), d.get("opened_at"),
                    d.get("entry_price"), d.get("size_usd"), d.get("peak_price"),
                    d.get("stop_price"), d.get("stop_pct"),
                    1 if d.get("trail_active") else 0, d.get("trail_pct"),
                    d.get("mode"), d.get("status", "open"),
                ),
            )
            return cur.lastrowid

    def update_position(self, pid: int, **kw):
        if "trail_active" in kw:
            kw["trail_active"] = 1 if kw["trail_active"] else 0
        sets = ", ".join(f"{k}=?" for k in kw)
        with self.cursor() as cur:
            cur.execute(f"UPDATE positions SET {sets} WHERE id=?", (*kw.values(), pid))

    def money_in_open(self) -> float:
        with self.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(SUM(size_usd),0) AS s FROM positions "
                "WHERE status IN ('open','exiting')"
            )
            return float(cur.fetchone()["s"])

    # ---- activity / prices / balance ----
    def add_activity(self, kind, mint, agent, title, subtitle, value, meta=None):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO activity(ts,kind,mint,agent,title,subtitle,value,meta) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (_utc(), kind, mint, agent, title, subtitle, value, json.dumps(meta or {})),
            )
            return cur.lastrowid

    def activity(self, before_id=None, limit=30) -> list[dict]:
        with self.cursor() as cur:
            if before_id:
                cur.execute(
                    "SELECT * FROM activity WHERE id<? ORDER BY id DESC LIMIT ?",
                    (before_id, limit),
                )
            else:
                cur.execute(
                    "SELECT * FROM activity ORDER BY id DESC LIMIT ?", (limit,)
                )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                if r.get("meta"):
                    try:
                        r["meta"] = json.loads(r["meta"])
                    except Exception:
                        pass
            return rows

    def add_price(self, mint, price, volume_m5=None, ts=None):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO prices(mint,ts,price,volume_m5) VALUES(?,?,?,?)",
                (mint, ts or _utc(), price, volume_m5),
            )

    def prices(self, mint: str, since: str | None = None) -> list[dict]:
        with self.cursor() as cur:
            if since:
                cur.execute(
                    "SELECT * FROM prices WHERE mint=? AND ts>=? ORDER BY ts",
                    (mint, since),
                )
            else:
                cur.execute(
                    "SELECT * FROM prices WHERE mint=? ORDER BY ts", (mint,)
                )
            return [dict(r) for r in cur.fetchall()]

    def add_balance(self, value: float, ts=None):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO balance(ts,value) VALUES(?,?)",
                (ts or _utc(), value),
            )

    def balances(self, since=None) -> list[dict]:
        with self.cursor() as cur:
            if since:
                cur.execute(
                    "SELECT * FROM balance WHERE ts>=? ORDER BY ts", (since,)
                )
            else:
                cur.execute("SELECT * FROM balance ORDER BY ts")
            return [dict(r) for r in cur.fetchall()]

    def latest_balance(self) -> float | None:
        with self.cursor() as cur:
            cur.execute("SELECT value FROM balance ORDER BY ts DESC LIMIT 1")
            r = cur.fetchone()
            return float(r["value"]) if r else None

    # ---- skips / rejects / nights ----
    def skip(self, mint: str, until: str):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO skips(mint,until) VALUES(?,?) "
                "ON CONFLICT(mint) DO UPDATE SET until=excluded.until",
                (mint, until),
            )

    def is_skipped(self, mint: str) -> bool:
        with self.cursor() as cur:
            cur.execute("SELECT until FROM skips WHERE mint=?", (mint,))
            r = cur.fetchone()
            return bool(r)

    def clear_skips(self):
        with self.cursor() as cur:
            cur.execute("DELETE FROM skips")

    def mark_rejected(self, mint: str, night: str, agent: str):
        with self.cursor() as cur:
            cur.execute(
                "INSERT OR IGNORE INTO rejected_mints(mint,night,agent) VALUES(?,?,?)",
                (mint, night, agent),
            )

    def was_rejected(self, mint: str, night: str) -> bool:
        with self.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM rejected_mints WHERE mint=? AND night=?",
                (mint, night),
            )
            return cur.fetchone() is not None

    def add_runner(self, mint, name, symbol, night, h24):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO runners(mint,name,symbol,night,h24) VALUES(?,?,?,?,?)",
                (mint, name, symbol, night, h24),
            )

    def runners_today(self, night: str) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM runners WHERE night=?", (night,))
            return [dict(r) for r in cur.fetchall()]

    def start_night(self, mode: str) -> int:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO nights(started_at,mode,full) VALUES(?,?,0)",
                (_utc(), mode),
            )
            return cur.lastrowid

    def end_night(self, night_id: int, full: bool = False):
        """Close a night. Uptime and shutdown never mark it full.

        full=True is refused. The only writer of full=1 is complete_paper_night.
        """
        if full:
            raise RuntimeError(
                "refusing to mark a night full from end_night; call complete_paper_night"
            )
        with self.cursor() as cur:
            cur.execute(
                "UPDATE nights SET ended_at=?, full=0 WHERE id=?",
                (_utc(), night_id),
            )

    def complete_paper_night(self, night_id: int, owner_wallet: str) -> tuple[bool, str]:
        """Owner wallet plus observed ingestion. A caller-supplied name is not enough."""
        import os
        expected = os.environ.get("DESK_OWNER_WALLET", "").strip()
        if not expected or owner_wallet != expected:
            return False, "owner wallet session is required"
        import nightpolicy
        ok, msg = nightpolicy.evaluate(self, night_id)
        if not ok:
            return False, msg
        with self.cursor() as cur:
            cur.execute("SELECT id, mode FROM nights WHERE id=?", (night_id,))
            row = cur.fetchone()
            if not row:
                return False, "night not found"
            if str(row["mode"]).upper() != "PAPER":
                return False, "only a PAPER night can be marked full"
            cur.execute(
                "UPDATE nights SET ended_at=?, full=1 WHERE id=?",
                (_utc(), night_id),
            )
        return True, msg

    def night_segment(self, night_id: int, boot_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM night_segments WHERE night_id=? AND boot_id=?",
                (night_id, boot_id),
            ).fetchone()
            return dict(row) if row else None

    def insert_night_segment(self, night_id, boot_id, wall, mono) -> None:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO night_segments(night_id,boot_id,start_wall,last_wall,start_mono,last_mono,scans,max_gap_s,broken) "
                "VALUES(?,?,?,?,?,?,1,0,0)",
                (night_id, boot_id, wall, wall, mono, mono),
            )

    def update_night_segment(self, night_id, boot_id, last_wall, last_mono, scans, max_gap, broken) -> None:
        with self.cursor() as cur:
            cur.execute(
                "UPDATE night_segments SET last_wall=?, last_mono=?, scans=?, max_gap_s=?, broken=? "
                "WHERE night_id=? AND boot_id=?",
                (last_wall, last_mono, scans, max_gap, broken, night_id, boot_id),
            )

    def quarantine_contains(self, key: str, encoded: str) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM settings_quarantine WHERE key=? AND value=? LIMIT 1",
                (key, encoded),
            ).fetchone()
            return row is not None

    def add_quarantine(self, key: str, encoded: str, reason: str) -> None:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO settings_quarantine(key,value,reason,quarantined_at) VALUES(?,?,?,?)",
                (key, encoded, reason, _utc()),
            )

    def delete_setting(self, key: str) -> None:
        with self.cursor() as cur:
            cur.execute("DELETE FROM settings WHERE key=?", (key,))

    def save_intent(self, row: dict) -> None:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO intents(id,created_at,wallet,cluster,message_sha256,canonical,status,"
                "signature_hex,executable,expires_at,max_lamports_in) VALUES(?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET status=excluded.status, signature_hex=excluded.signature_hex",
                (
                    row["id"], row.get("created_at") or _utc(), row.get("wallet"), row.get("cluster"),
                    row.get("message_sha256"), row.get("canonical"), row.get("status"),
                    row.get("signature_hex"), 0, row.get("expires_at"), int(row.get("max_lamports_in") or 0),
                ),
            )

    def list_intents(self, wallet: str, limit: int = 20) -> list[dict]:
        with self.cursor() as cur:
            cur.execute(
                "SELECT id, created_at, wallet, cluster, message_sha256, status, expires_at, max_lamports_in "
                "FROM intents WHERE wallet=? ORDER BY created_at DESC LIMIT ?",
                (wallet, limit),
            )
            return [dict(r) for r in cur.fetchall()]

    def open_lamports_for_wallet(self, wallet: str) -> int:
        with self.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(SUM(max_lamports_in),0) AS s FROM intents "
                "WHERE wallet=? AND status IN ('open','verified')",
                (wallet,),
            )
            return int(cur.fetchone()["s"])

    def insert_nonce(self, nonce: str, wallet: str, cluster: str, domain: str, message: str, expires_at: str) -> None:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO login_nonces(nonce,wallet,cluster,domain,message,expires_at,used) VALUES(?,?,?,?,?,?,0)",
                (nonce, wallet, cluster, domain, message, expires_at),
            )

    def take_nonce(self, nonce: str) -> dict | None:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM login_nonces WHERE nonce=? AND used=0", (nonce,))
            row = cur.fetchone()
            if not row:
                return None
            cur.execute("UPDATE login_nonces SET used=1 WHERE nonce=?", (nonce,))
            return dict(row)

    def save_session(self, id_hash: str, wallet: str, cluster: str, csrf: str, expires_at: str) -> None:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO wallet_sessions(id_hash,wallet,cluster,csrf,created_at,expires_at) VALUES(?,?,?,?,?,?)",
                (id_hash, wallet, cluster, csrf, _utc(), expires_at),
            )

    def get_session(self, id_hash: str) -> dict | None:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM wallet_sessions WHERE id_hash=?", (id_hash,))
            row = cur.fetchone()
            return dict(row) if row else None

    def delete_session(self, id_hash: str) -> None:
        with self.cursor() as cur:
            cur.execute("DELETE FROM wallet_sessions WHERE id_hash=?", (id_hash,))

    def enqueue_notification(self, kind: str, body: str) -> int:
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO notification_outbox(created_at,kind,body,status) VALUES(?,?,?,?)",
                (_utc(), kind, body, "pending"),
            )
            return int(cur.lastrowid)

    def ping(self) -> bool:
        """Read-only liveness of the open connection. Does not insert or migrate."""
        with self._lock:
            row = self._conn.execute("SELECT 1").fetchone()
            return bool(row and row[0] == 1)

    def pipeline_timestamps(self) -> dict[str, str | None]:
        """Latest stored clocks. Read-only."""
        queries = {
            "last_migration_at": "SELECT MAX(migrated_at) AS t FROM waiting_room",
            "last_scan_at": "SELECT MAX(ts) AS t FROM scans",
            "last_audit_at": "SELECT MAX(ts) AS t FROM audit_runs",
            "last_verdict_at": "SELECT MAX(ts) AS t FROM verdicts",
            "last_signal_at": "SELECT MAX(ts) AS t FROM signals",
        }
        out: dict[str, str | None] = {}
        with self._lock:
            for key, sql in queries.items():
                row = self._conn.execute(sql).fetchone()
                out[key] = row[0] if row and row[0] else None
        return out

    def has_full_paper_night(self) -> bool:
        with self.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM nights WHERE mode='PAPER' AND full=1 LIMIT 1"
            )
            return cur.fetchone() is not None

    # ---- push subs ----
    def save_push_sub(self, endpoint, p256dh, auth):
        with self.cursor() as cur:
            cur.execute(
                "INSERT INTO push_subs(endpoint,p256dh,auth,created_at) VALUES(?,?,?,?) "
                "ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth",
                (endpoint, p256dh, auth, _utc()),
            )

    def delete_push_sub(self, endpoint):
        with self.cursor() as cur:
            cur.execute("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))

    def all_push_subs(self) -> list[dict]:
        with self.cursor() as cur:
            cur.execute("SELECT * FROM push_subs")
            return [dict(r) for r in cur.fetchall()]

    # ---- counts ----
    def count_today(self, table: str, night_prefix: str | None = None) -> int:
        with self.cursor() as cur:
            if table == "scans":
                cur.execute("SELECT COUNT(*) AS c FROM scans")
            elif table == "audit_runs":
                cur.execute("SELECT COUNT(*) AS c FROM audit_runs")
            elif table == "verdicts":
                cur.execute("SELECT COUNT(*) AS c FROM verdicts")
            elif table == "signals":
                cur.execute("SELECT COUNT(*) AS c FROM signals WHERE status IN ('bought','sent')")
            elif table == "positions_closed":
                cur.execute("SELECT COUNT(*) AS c FROM positions WHERE status='closed'")
            else:
                return 0
            return int(cur.fetchone()["c"])
