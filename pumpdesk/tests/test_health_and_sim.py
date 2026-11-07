"""Offline checks for health, PAPER/LIVE safety, and simulated signing."""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ["APP_TOKEN"] = "dummy-test-token"

import config
from bus import BoundedQueue
from db import DB
from health import build_health
from rpc_allowlist import validate_rpc_url
from simpreview import BANNER, BROADCAST_ENABLED, SimStore, create_preview, get_preview, verify_preview
from telegram import Telegram
from tools.probe import ListAlert, run_probe

MINT = "So11111111111111111111111111111111111111112"
DEST = "11111111111111111111111111111111"


def _public_bytes(key):
    public = key.public_key()
    if hasattr(public, "public_bytes_raw"):
        return public.public_bytes_raw()
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    return public.public_bytes(Encoding.Raw, PublicFormat.Raw)


def _db():
    return DB(Path(tempfile.mkdtemp()) / "desk.db")


def _body(**overrides):
    body = {
        "cluster": "devnet",
        "mint": MINT,
        "name": "Example",
        "symbol": "EX",
        "decimals": 6,
        "side": "buy",
        "amount_base": 1000,
        "destination": DEST,
        "max_lamports_in": 100_000,
        "min_amount_out": 900,
        "slippage_bps": 50,
        "fee_lamports_ceiling": 5000,
    }
    body.update(overrides)
    return body


class SafetyTests(unittest.TestCase):
    def setUp(self):
        config.init()

    def test_uptime_does_not_mark_night_full(self):
        db = _db()
        night = db.start_night("PAPER")
        db.end_night(night, full=False)
        self.assertFalse(db.has_full_paper_night())
        with self.assertRaises(RuntimeError):
            db.end_night(night, full=True)
        self.assertFalse(db.has_full_paper_night())
        ok, _msg = db.complete_paper_night(night, who="operator-test")
        self.assertTrue(ok)
        self.assertTrue(db.has_full_paper_night())

    def test_live_tap_does_not_open_a_position(self):
        from agents.executor import Executor
        from bus import Bus

        db = _db()
        config._state["desk.mode"] = "LIVE"
        exe = Executor(db, Bus(), notifier=None)

        async def fake_dex(_mint):
            return {"priceUsd": "1.0", "liquidity": {"usd": 100000}}

        exe._dex = fake_dex

        async def run():
            await exe._handle({
                "mint": MINT,
                "name": "Example",
                "symbol": "EX",
                "score": 80,
                "scanner": {"liquidityUsd": 100000},
                "dex": {"priceUsd": "1.0"},
            })

        asyncio.run(run())
        self.assertIsNone(db.get_position(MINT))

    def test_paper_still_records_a_simulated_fill(self):
        from agents.executor import Executor
        from bus import Bus

        class Notifier:
            async def buy_push(self, *args, **kwargs):
                return None

        db = _db()
        config._state["desk.mode"] = "PAPER"
        config.set_paper_balance(200)
        db.add_balance(200)
        exe = Executor(db, Bus(), notifier=Notifier())

        async def fake_dex(_mint):
            return {"priceUsd": "1.0", "liquidity": {"usd": 1000000}}

        exe._dex = fake_dex

        async def run():
            await exe._handle({
                "mint": MINT,
                "name": "Example",
                "symbol": "EX",
                "score": 90,
                "scanner": {"liquidityUsd": 1000000},
                "dex": {"priceUsd": "1.0"},
            })

        asyncio.run(run())
        self.assertIsNotNone(db.get_position(MINT))
        self.assertEqual(db.get_position(MINT)["mode"], "PAPER")

    def test_empty_owner_does_not_claim_start(self):
        db = _db()
        config._state["desk.owner_chat_id"] = 0
        tg = Telegram(db, None)
        self.assertEqual(tg.owner_id, 0)

        async def run():
            await tg._handle({
                "message": {"from": {"id": 42}, "chat": {"id": 42}, "text": "/start"}
            })

        asyncio.run(run())
        self.assertEqual(tg.owner_id, 0)
        self.assertEqual(int(config.get("desk.owner_chat_id") or 0), 0)
        self.assertIsNone(tg._client)

    def test_rpc_allowlist_blocks_arbitrary_hosts(self):
        ok, _ = validate_rpc_url("https://api.devnet.solana.com")
        self.assertTrue(ok)
        bad, _ = validate_rpc_url("http://169.254.169.254/latest")
        self.assertFalse(bad)
        bad, _ = validate_rpc_url("https://user:secret@evil.example/rpc")
        self.assertFalse(bad)
        self.assertFalse(config.set_setting("desk.rpc_url", "https://evil.example/rpc")[0])


class HealthTests(unittest.TestCase):
    def test_quiet_db_is_idle_not_ok(self):
        from bus import Bus
        db = _db()
        body = build_health(db, Bus(), telegram=None, scanner=None)
        self.assertEqual(body["trading_status"], "idle")
        self.assertEqual(body["ingestion"], "idle")
        self.assertFalse(body["broadcast_enabled"])

    def test_routes_have_no_query_token_and_no_writes(self):
        from fastapi.testclient import TestClient
        from api import create_app
        from bus import Bus

        db = _db()
        before = db.pipeline_timestamps()
        app = create_app(db, Bus(), desk=None)
        client = TestClient(app)
        live = client.get("/health/live")
        ready = client.get("/health/ready")
        self.assertEqual(live.status_code, 200)
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(db.pipeline_timestamps(), before)
        self.assertEqual(client.get("/health").status_code, 401)
        self.assertEqual(client.get("/health?t=dummy-test-token").status_code, 401)
        ok = client.get("/health", headers={"X-App-Token": "dummy-test-token"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["trading_status"], "idle")
        metrics = client.get("/metrics", headers={"X-App-Token": "dummy-test-token"})
        self.assertEqual(metrics.status_code, 200)
        self.assertEqual(metrics.json()["broadcast_enabled"], 0)

    def test_queue_drop_is_counted(self):
        queue = BoundedQueue("auditor", maxsize=1)
        asyncio.run(queue.put({"n": 1}))
        asyncio.run(queue.put({"n": 2}))
        self.assertEqual(queue.qsize(), 1)
        self.assertEqual(queue.dropped, 1)

    def test_probe_uses_the_alert_double_only(self):
        class Client:
            def get(self, url):
                class R:
                    status_code = 200 if url.endswith("/health/live") else 503
                return R()

        alert = ListAlert()
        result = run_probe("http://127.0.0.1:9", Client(), alert)
        self.assertTrue(result.alerted)
        self.assertEqual(len(alert.messages), 1)
        self.assertNotIn("http", alert.messages[0])


class SimTests(unittest.TestCase):
    def test_preview_hash_and_crypto_roundtrip(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        self.assertFalse(BROADCAST_ENABLED)
        source = Path(__file__).resolve().parents[1].joinpath("simpreview.py").read_text()
        self.assertNotIn("sendTransaction", source)
        store = SimStore()
        row = create_preview(store, _body(), "idem-1")
        self.assertEqual(row["banner"], BANNER)
        self.assertFalse(row["executable"])
        again = create_preview(store, _body(), "idem-1")
        self.assertEqual(again["id"], row["id"])
        with self.assertRaises(Exception) as ctx:
            create_preview(store, _body(amount_base=2), "idem-1")
        self.assertEqual(ctx.exception.code, "idempotency")
        key = Ed25519PrivateKey.generate()
        signature = key.sign(row["canonical"].encode())
        public = _public_bytes(key)
        verified = verify_preview(store, row["id"], public, signature, row["message_sha256"])
        self.assertTrue(verified["ok"])
        self.assertFalse(verified["broadcast_enabled"])
        with self.assertRaises(Exception) as replay:
            verify_preview(store, row["id"], public, signature, row["message_sha256"])
        self.assertEqual(replay.exception.code, "replay")

    def test_rejects_tamper_expiry_cluster_limit_and_stop(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        store = SimStore()
        row = create_preview(store, _body(), None)
        key = Ed25519PrivateKey.generate()
        public = _public_bytes(key)
        bad_sig = key.sign(b"other message")
        with self.assertRaises(Exception) as tamper:
            verify_preview(store, row["id"], public, bad_sig, row["message_sha256"])
        self.assertEqual(tamper.exception.code, "signature")
        with self.assertRaises(Exception) as wrong_hash:
            verify_preview(store, row["id"], public, key.sign(row["canonical"].encode()), "0" * 64)
        self.assertEqual(wrong_hash.exception.code, "hash")
        store.rows[row["id"]]["expires_at"] = "2000-01-01T00:00:00Z"
        with self.assertRaises(Exception) as expired:
            get_preview(store, row["id"])
        self.assertEqual(expired.exception.code, "expired")
        with self.assertRaises(Exception) as cluster:
            create_preview(store, _body(cluster="mainnet-beta"), None)
        self.assertEqual(cluster.exception.code, "cluster")
        with self.assertRaises(Exception) as limit:
            create_preview(store, _body(max_lamports_in=10**12), None)
        self.assertEqual(limit.exception.code, "limit")
        store.stop()
        with self.assertRaises(Exception) as stopped:
            create_preview(store, _body(), None)
        self.assertEqual(stopped.exception.code, "stopped")


if __name__ == "__main__":
    unittest.main()
