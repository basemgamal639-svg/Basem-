"""Security, migration, rollback, pinned RPC, and loopback startup. No network and no Telegram."""
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

os.environ["NOTIFY_DELIVER"] = "0"
os.environ["SESSION_SECURE"] = "0"
os.environ.pop("TG_TOKEN", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import nightpolicy
from db import DB
from pinned_rpc import RpcRefused, choose_address, post_json
from preflight import bind_rejected, secrets_dir_rejected
from settings_guard import quarantine


def _db():
    return DB(Path(tempfile.mkdtemp()) / "desk.db")


class ReconcileTests(unittest.TestCase):
    def tearDown(self):
        nightpolicy.reset_for_tests()

    def test_paper_night_needs_coverage_owner_and_continuity(self):
        db = _db()
        night = db.start_night("PAPER")
        os.environ["DESK_OWNER_WALLET"] = "OwnerWallet111111111111111111111111111111"
        self.assertFalse(db.complete_paper_night(night, "someone-else")[0])
        self.assertFalse(db.complete_paper_night(night, os.environ["DESK_OWNER_WALLET"])[0])
        db.heartbeat("scanner")
        self.assertFalse(db.complete_paper_night(night, os.environ["DESK_OWNER_WALLET"])[0])
        nightpolicy.bind_night(night)
        base = 1_700_000_000
        for i in range(nightpolicy.MIN_INGESTED_SCANS):
            wall = base + i * nightpolicy.MAX_GAP_S
            mono = 1000 + i * nightpolicy.MAX_GAP_S
            nightpolicy.set_clock(lambda w=wall, m=mono: (datetime.fromtimestamp(w, tz=timezone.utc), m))
            db.add_scan({"mint": "So11111111111111111111111111111111111111112", "ts": "2026-01-01T00:00:00Z", "verdict": "pass"})
        ok, msg = db.complete_paper_night(night, os.environ["DESK_OWNER_WALLET"])
        self.assertTrue(ok, msg)
        self.assertIn("not a claim", msg)
        nightpolicy._boot_id = "restarted"
        self.assertFalse(db.complete_paper_night(night, os.environ["DESK_OWNER_WALLET"])[0])

    def test_clock_step_breaks_the_segment(self):
        db = _db()
        night = db.start_night("PAPER")
        nightpolicy.bind_night(night)
        nightpolicy.set_clock(lambda: (datetime.fromtimestamp(1_700_000_000, tz=timezone.utc), 10))
        db.add_scan({"mint": "So11111111111111111111111111111111111111112", "ts": "t", "verdict": "pass"})
        nightpolicy.set_clock(lambda: (datetime.fromtimestamp(1_699_000_000, tz=timezone.utc), 11))
        db.add_scan({"mint": "So11111111111111111111111111111111111111112", "ts": "t", "verdict": "pass"})
        os.environ["DESK_OWNER_WALLET"] = "OwnerWallet111111111111111111111111111111"
        self.assertFalse(db.complete_paper_night(night, os.environ["DESK_OWNER_WALLET"])[0])

    def test_quarantine_keeps_history_and_rolls_back(self):
        db = _db()
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)",
                ("desk.mode", '"LIVE"', "t"),
            )
            cur.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)",
                ("scanner.min_liquidity_usd", "40000", "t"),
            )
            cur.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)",
                ("desk.rpc_url", '"http://169.254.169.254/latest"', "t"),
            )
        with self.assertRaises(RuntimeError):
            quarantine(db, db.all_settings(), fail_after="desk.mode")
        self.assertEqual(db.all_settings()["desk.mode"], "LIVE")
        safe = quarantine(db, db.all_settings())
        self.assertEqual(safe["desk.mode"], "PAPER")
        self.assertEqual(safe["scanner.min_liquidity_usd"], 40000)
        again = quarantine(db, db.all_settings())
        with db.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM settings_quarantine")
            first = cur.fetchone()["c"]
        quarantine(db, again)
        with db.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM settings_quarantine")
            second = cur.fetchone()["c"]
        self.assertEqual(first, second)
        self.assertGreaterEqual(first, 1)

    def test_legacy_tables_and_file_rollback(self):
        import config
        path = Path(tempfile.mkdtemp()) / "legacy.db"
        con = sqlite3.connect(path)
        con.executescript(Path(__file__).resolve().parent.joinpath("fixtures/legacy_user_version0.sql").read_text())
        con.execute("INSERT INTO scans(mint,ts,verdict) VALUES (?,?,?)", ("M111111111111111111111111111111111111111", "2026-01-02T00:00:00Z", "pass"))
        con.execute("INSERT INTO positions(mint,name,status,mode,size_usd) VALUES (?,?,?,?,?)", ("M111111111111111111111111111111111111111", "N", "closed", "PAPER", 2))
        con.execute("INSERT INTO signals(mint,ts,status,mode) VALUES (?,?,?,?)", ("M111111111111111111111111111111111111111", "2026-01-02T00:00:00Z", "sent", "PAPER"))
        con.execute("INSERT INTO settings(key,value,updated_at) VALUES (?,?,?)", ("desk.mode", '"LIVE"', "t"))
        con.execute("INSERT INTO coins(mint,name) VALUES (?,?)", ("M111111111111111111111111111111111111111", "Kept"))
        con.commit()
        con.close()
        backup = path.with_suffix(".bak")
        shutil.copy(path, backup)
        db = DB(path)
        config.init(db)
        self.assertEqual(db.get_coin("M111111111111111111111111111111111111111")["name"], "Kept")
        self.assertTrue(db.recent_scans(5))
        self.assertEqual(config.get("desk.mode"), "PAPER")
        with db.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM signals")
            self.assertEqual(cur.fetchone()["c"], 1)
            cur.execute("PRAGMA integrity_check")
            self.assertEqual(cur.fetchone()[0], "ok")
        db.close()
        shutil.copy(backup, path)
        raw = sqlite3.connect(path)
        raw.row_factory = sqlite3.Row
        self.assertEqual(raw.execute("SELECT value FROM settings WHERE key='desk.mode'").fetchone()["value"], '"LIVE"')
        self.assertIsNone(raw.execute("SELECT name FROM sqlite_master WHERE name='schema_migrations'").fetchone())
        raw.close()

    def test_pinned_transport_and_blocked_answers(self):
        import asyncio
        import httpx
        captured = {}

        class Capture(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                captured["host"] = request.url.host
                captured["sni"] = request.extensions.get("sni_hostname")
                captured["header"] = request.headers.get("host")
                return httpx.Response(200, json={"result": "ok"})

        async def run():
            response = await post_json(
                "https://api.devnet.solana.com",
                {"jsonrpc": "2.0", "id": 1, "method": "getHealth"},
                resolver=lambda host: ["1.1.1.1"],
                transport=Capture(),
            )
            self.assertEqual(response.status_code, 200)

        asyncio.run(run())
        self.assertEqual(captured["host"], "1.1.1.1")
        self.assertEqual(captured["sni"], "api.devnet.solana.com")
        self.assertEqual(captured["header"], "api.devnet.solana.com")
        for bad in ("169.254.169.254", "10.1.2.3", "::ffff:127.0.0.1", "fe80::1", "::"):
            with self.assertRaises(RpcRefused):
                choose_address("https://api.devnet.solana.com", resolver=lambda host, answer=bad: [answer])
        host, ip, _port = choose_address("http://127.0.0.1:8899", resolver=lambda host: ["127.0.0.1"])
        self.assertEqual(ip, "127.0.0.1")

    def test_preflight_rejects_public_bind_and_open_secrets_dir(self):
        self.assertIsNotNone(bind_rejected("0.0.0.0"))
        self.assertIsNone(bind_rejected("127.0.0.1"))
        directory = Path(tempfile.mkdtemp())
        os.chmod(directory, 0o755)
        self.assertIsNotNone(secrets_dir_rejected(directory))
        os.chmod(directory, 0o700)
        self.assertIsNone(secrets_dir_rejected(directory))

    def test_offline_loopback_process_does_not_poll(self):
        port = _free_port()
        env = os.environ.copy()
        env.update({
            "DESK_OFFLINE": "1",
            "DESK_HOST": "127.0.0.1",
            "DESK_PORT": str(port),
            "PYTHONDONTWRITEBYTECODE": "1",
            "NOTIFY_DELIVER": "0",
        })
        env.pop("TG_TOKEN", None)
        root = Path(tempfile.mkdtemp())
        shutil.copytree(Path(__file__).resolve().parents[1], root / "pumpdesk", dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        proc = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=root / "pumpdesk",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            deadline = time.time() + 15
            body = ""
            while time.time() < deadline:
                if proc.poll() is not None:
                    break
                try:
                    import urllib.request
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/health/live", timeout=0.5) as response:
                        body = response.read().decode()
                        if response.status == 200:
                            break
                except Exception:
                    time.sleep(0.2)
            self.assertIn("live", body)
            self.assertIsNone(proc.poll())
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        refused = os.environ.copy()
        refused.update({"DESK_OFFLINE": "1", "DESK_HOST": "0.0.0.0", "DESK_PORT": str(_free_port()), "PYTHONDONTWRITEBYTECODE": "1"})
        refused.pop("TG_TOKEN", None)
        denied = subprocess.run(
            [sys.executable, "main.py"],
            cwd=root / "pumpdesk",
            env=refused,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(denied.returncode, 0)


def _free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


if __name__ == "__main__":
    unittest.main()
