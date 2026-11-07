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
            if proc.poll() is None:
                proc.terminate()
            try:
                proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate(timeout=5)
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

    def test_second_open_preserves_every_table_count(self):
        path = Path(tempfile.mkdtemp()) / "legacy.db"
        con = sqlite3.connect(path)
        con.executescript(Path(__file__).resolve().parent.joinpath("fixtures/legacy_user_version0.sql").read_text())
        con.execute("INSERT INTO activity(ts,kind) VALUES ('t','scan')")
        con.execute("INSERT INTO audit_runs(mint,ts,passed) VALUES ('M','t',1)")
        con.execute("INSERT INTO audits(mint,ts,layer,name,pass) VALUES ('M','t',1,'mint',1)")
        con.execute("INSERT INTO balance(ts,value) VALUES ('t',200)")
        con.execute("INSERT INTO change_log(ts,key,old,new,who) VALUES ('t','desk.mode','PAPER','LIVE','legacy')")
        con.execute("INSERT INTO coins(mint,name) VALUES ('M','Kept')")
        con.execute("INSERT INTO heartbeats(agent,ts) VALUES ('scanner','t')")
        con.execute("INSERT INTO nights(started_at,mode,full) VALUES ('t','PAPER',0)")
        con.execute("INSERT INTO positions(mint,name,status,mode,size_usd) VALUES ('M','N','closed','PAPER',2)")
        con.execute("INSERT INTO prices(mint,ts,price) VALUES ('M','t',1.0)")
        con.execute("INSERT INTO push_subs(endpoint,p256dh,auth,created_at) VALUES ('https://push.example','k','a','t')")
        con.execute("INSERT INTO rejected_mints(mint,night,agent) VALUES ('M','2026-01-01','scanner')")
        con.execute("INSERT INTO runners(mint,name,night) VALUES ('M','N','2026-01-01')")
        con.execute("INSERT INTO scans(mint,ts,verdict) VALUES ('M','t','pass')")
        con.execute("INSERT INTO settings(key,value,updated_at) VALUES ('desk.mode','\"LIVE\"','t')")
        con.execute("INSERT INTO signals(mint,ts,status,mode) VALUES ('M','t','sent','PAPER')")
        con.execute("INSERT INTO skips(mint,until) VALUES ('M','t')")
        con.execute("INSERT INTO verdicts(mint,ts,score,pass) VALUES ('M','t',80,1)")
        con.execute("INSERT INTO waiting_room(mint,name,night) VALUES ('M','N','2026-01-01')")
        con.commit()
        con.close()
        first = DB(path)
        with first.cursor() as cur:
            cur.execute(
                "INSERT INTO intents(id,created_at,wallet,cluster,message_sha256,canonical,status,executable) "
                "VALUES ('i','t','w','devnet','ab','text','preview',0)"
            )
            cur.execute(
                "INSERT INTO wallet_sessions(id_hash,wallet,cluster,csrf,created_at,expires_at) "
                "VALUES ('h','w','devnet','c','t','2099-01-01T00:00:00Z')"
            )
            cur.execute(
                "INSERT INTO login_nonces(nonce,wallet,cluster,domain,message,expires_at,used) "
                "VALUES ('n','w','devnet','testserver','m','2099-01-01T00:00:00Z',0)"
            )
            cur.execute(
                "INSERT INTO notification_outbox(created_at,kind,body,status) VALUES ('t','note','body','pending')"
            )
            cur.execute(
                "INSERT INTO settings_quarantine(key,value,reason,quarantined_at) VALUES ('desk.mode','\"LIVE\"','mode','t')"
            )
            cur.execute(
                "INSERT INTO night_segments(night_id,boot_id,start_wall,last_wall,start_mono,last_mono,scans,max_gap_s,broken) "
                "VALUES (1,'boot',1,2,1,2,1,300,0)"
            )
        before = _table_counts(path)
        self.assertGreaterEqual(len(before), 26)
        for name, count in before.items():
            self.assertGreaterEqual(count, 1, name)
        first.close()
        second = DB(path)
        second.close()
        after = _table_counts(path)
        self.assertEqual(after, before)

    def test_missing_origin_is_accepted_and_mismatch_is_rejected(self):
        """Documented behavior: a valid session and CSRF header succeed when Origin is absent.
        A present Origin that does not match Host is rejected. This is not a browser CSRF bypass.
        """
        client, csrf = _owner_client()
        body = {"settings": {"desk.emergency_stop": False}}
        headers = {"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf}
        accepted = client.post("/api/settings", json=body, headers=headers)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertNotIn("origin", {k.lower() for k in accepted.request.headers})
        self.assertTrue(accepted.json()["results"]["desk.emergency_stop"]["ok"])
        mismatched = client.post(
            "/api/settings",
            json=body,
            headers={**headers, "Origin": "https://evil.example"},
        )
        self.assertEqual(mismatched.status_code, 403, mismatched.text)
        from simpreview import BROADCAST_ENABLED
        self.assertFalse(BROADCAST_ENABLED)

    def test_clearing_stop_requires_owner_and_csrf(self):
        import config
        from simpreview import BROADCAST_ENABLED

        client, csrf = _owner_client()
        from fastapi.testclient import TestClient
        config._state["desk.emergency_stop"] = True
        anonymous = TestClient(client.app).post("/api/settings", json={"settings": {"desk.emergency_stop": False}})
        self.assertEqual(anonymous.status_code, 401, anonymous.text)
        self.assertTrue(config.get("desk.emergency_stop"))
        no_csrf = client.post(
            "/api/settings",
            json={"settings": {"desk.emergency_stop": False, "desk.broadcast_enabled": True}},
            headers={"X-Requested-With": "pumpdesk"},
        )
        self.assertEqual(no_csrf.status_code, 403, no_csrf.text)
        self.assertTrue(config.get("desk.emergency_stop"))
        cleared = client.post(
            "/api/settings",
            json={"settings": {"desk.emergency_stop": False, "desk.broadcast_enabled": True}},
            headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf},
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        results = cleared.json()["results"]
        self.assertTrue(results["desk.emergency_stop"]["ok"])
        self.assertFalse(results["desk.broadcast_enabled"]["ok"])
        self.assertFalse(config.get("desk.emergency_stop"))
        self.assertFalse(config.get("desk.broadcast_enabled"))
        self.assertFalse(BROADCAST_ENABLED)

    def test_stop_after_logout_is_rejected(self):
        import config
        from simpreview import BROADCAST_ENABLED

        client, csrf = _owner_client()
        saved = client.cookies.get("desk_session")
        stopped = client.post(
            "/api/sim/stop",
            headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf},
        )
        self.assertEqual(stopped.status_code, 200, stopped.text)
        self.assertTrue(stopped.json()["stopped"])
        self.assertFalse(stopped.json()["broadcast_enabled"])
        self.assertFalse(BROADCAST_ENABLED)
        self.assertTrue(config.get("desk.emergency_stop"))
        logged_out = client.post(
            "/api/session/logout",
            headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf},
        )
        self.assertEqual(logged_out.status_code, 200, logged_out.text)
        from fastapi.testclient import TestClient
        replay = TestClient(client.app)
        replay.cookies.set("desk_session", saved)
        replay.cookies.set("desk_csrf", csrf)
        again = replay.post(
            "/api/sim/stop",
            headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf},
        )
        self.assertEqual(again.status_code, 401, again.text)
        self.assertTrue(config.get("desk.emergency_stop"))
        self.assertFalse(BROADCAST_ENABLED)

    def test_session_status_rejects_a_wallet_that_is_not_the_owner(self):
        client, _csrf = _owner_client()
        current = client.get("/api/session")
        self.assertTrue(current.json()["connected"])
        self.assertEqual(current.json()["wallet"], os.environ["DESK_OWNER_WALLET"])
        saved = client.cookies.get("desk_session")
        os.environ["DESK_OWNER_WALLET"] = "DifferentOwner111111111111111111111111111"
        invalidated = client.get("/api/session")
        self.assertFalse(invalidated.json()["connected"])
        self.assertIsNone(invalidated.json()["wallet"])
        os.environ["DESK_OWNER_WALLET"] = current.json()["wallet"]
        from fastapi.testclient import TestClient
        revived_client = TestClient(client.app)
        revived_client.cookies.set("desk_session", saved)
        revived = revived_client.get("/api/session")
        self.assertFalse(revived.json()["connected"])

    def test_planb_writes_no_files(self):
        import asyncio
        from planb import PlanBWriter

        os.environ["DATA_PATH"] = "not-a-real-export"
        try:
            writer = PlanBWriter(None, None)
            self.assertIsNotNone(writer.root)
            self.assertFalse(writer.root.exists())
            writer.ensure()
            asyncio.run(writer.run())
            asyncio.run(writer.write_all())
            self.assertFalse(writer.root.exists())
        finally:
            os.environ.pop("DATA_PATH", None)
        empty = PlanBWriter(None, None)
        self.assertIsNone(empty.root)
        empty.ensure()
        asyncio.run(empty.write_all())


def _table_counts(path):
    con = sqlite3.connect(path)
    names = [row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    counts = {name: con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in names}
    con.close()
    return counts


def _owner_client():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from fastapi.testclient import TestClient
    from api import create_app
    from bus import Bus
    from session import b58encode

    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes_raw()
    wallet = b58encode(public)
    os.environ["DESK_OWNER_WALLET"] = wallet
    client = TestClient(create_app(_db(), Bus(), None))
    nonce = client.post(
        "/api/session/nonce",
        json={"wallet": wallet, "cluster": "devnet"},
        headers={"X-Requested-With": "pumpdesk"},
    )
    if nonce.status_code != 200:
        raise AssertionError(nonce.text)
    csrf = nonce.cookies.get("desk_csrf")
    body = nonce.json()
    signature = key.sign(body["message"].encode())
    verified = client.post(
        "/api/session/verify",
        json={
            "wallet": wallet,
            "cluster": "devnet",
            "nonce": body["nonce"],
            "public_key_hex": public.hex(),
            "signature_hex": signature.hex(),
        },
        headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": csrf},
    )
    if verified.status_code != 200:
        raise AssertionError(verified.text)
    return client, verified.cookies.get("desk_csrf")


def _free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


if __name__ == "__main__":
    unittest.main()
