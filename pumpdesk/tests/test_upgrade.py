"""Migration, wallet session, chain-fixture checks, and notification outbox."""
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["APP_TOKEN"] = "dummy-test-token"
os.environ["SESSION_SECURE"] = "0"
os.environ["NOTIFY_DELIVER"] = "0"

import config
from chaincheck import evaluate_fill
from db import DB
from notifier import Notifier
from session import b58decode, b58encode, issue_nonce, verify_login


def _db():
    return DB(Path(tempfile.mkdtemp()) / "desk.db")


class UpgradeTests(unittest.TestCase):
    def test_old_fixture_keeps_rows_and_gains_tables(self):
        path = Path(tempfile.mkdtemp()) / "old.db"
        con = sqlite3.connect(path)
        con.execute(
            "CREATE TABLE coins (mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, pool TEXT, "
            "migrated_at TEXT, creator TEXT, creator_balance_at_migration REAL, holders INTEGER, night TEXT)"
        )
        con.execute(
            "INSERT INTO coins VALUES (?,?,?,?,?,?,?,?,?)",
            ("MintKept111111111111111111111111111111111", "Kept", "K", None, None, None, None, 1, "2026-01-01"),
        )
        con.commit()
        con.close()
        db = DB(path)
        self.assertEqual(db.get_coin("MintKept111111111111111111111111111111111")["name"], "Kept")
        db.save_intent({
            "id": "intent-1",
            "wallet": "wallet",
            "cluster": "devnet",
            "message_sha256": "abc",
            "canonical": "SIMULATED",
            "status": "open",
            "expires_at": "2099-01-01T00:00:00Z",
            "max_lamports_in": 10,
        })
        self.assertEqual(len(db.list_intents("wallet")), 1)

    def test_login_nonce_is_one_use_and_domain_bound(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        db = _db()
        key = Ed25519PrivateKey.generate()
        public = key.public_key().public_bytes_raw()
        wallet = b58encode(public)
        self.assertEqual(b58decode(wallet), public)
        issued = issue_nonce(db, wallet, "devnet", "testserver")
        signature = key.sign(issued["message"].encode())
        session = verify_login(db, wallet, "devnet", issued["nonce"], signature, public, "testserver")
        self.assertEqual(session["wallet"], wallet)
        with self.assertRaises(Exception):
            verify_login(db, wallet, "devnet", issued["nonce"], signature, public, "testserver")
        with self.assertRaises(Exception):
            issue_nonce(db, wallet, "mainnet-beta", "testserver")

    def test_chain_fixture_is_not_a_live_fill(self):
        expected = {
            "signature": "sig1",
            "cluster": "devnet",
            "mint": "mint",
            "destination": "owner",
            "min_amount_out": 5,
            "side": "buy",
            "message": "frozen",
        }
        bad = evaluate_fill({"signature": "sig1", "confirmationStatus": "processed", "err": None}, None, expected)
        self.assertFalse(bad["filled"])
        good_tx = {
            "cluster": "devnet",
            "meta": {
                "err": None,
                "preTokenBalances": [{"owner": "owner", "mint": "mint", "uiTokenAmount": {"amount": "1"}}],
                "postTokenBalances": [{"owner": "owner", "mint": "mint", "uiTokenAmount": {"amount": "9"}}],
            },
            "transaction": {"signatures": ["sig1"], "message": "frozen"},
        }
        good = evaluate_fill(
            {"signature": "sig1", "confirmationStatus": "finalized", "err": None},
            good_tx,
            expected,
        )
        self.assertTrue(good["filled"])
        wrong_cluster = dict(good_tx)
        wrong_cluster["cluster"] = "mainnet-beta"
        self.assertFalse(evaluate_fill(
            {"signature": "sig1", "confirmationStatus": "finalized", "err": None},
            wrong_cluster,
            expected,
        )["filled"])

    def test_outbox_does_not_call_transport_when_delivery_is_off(self):
        db = _db()

        class Boom:
            ok = True

            async def send(self, *args, **kwargs):
                raise AssertionError("transport was called")

        import asyncio
        notifier = Notifier(telegram=Boom(), db=db)
        asyncio.run(notifier.send("hello paper"))
        with db.cursor() as cur:
            cur.execute("SELECT body, status FROM notification_outbox")
            row = cur.fetchone()
        self.assertIn("hello paper", row["body"])
        self.assertEqual(row["status"], "pending")

    def test_http_session_gates_preview_and_refuses_live(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from fastapi.testclient import TestClient
        from api import create_app
        from bus import Bus

        config.init()
        db = _db()
        client = TestClient(create_app(db, Bus(), desk=None))
        self.assertEqual(client.post("/api/mode", json={"mode": "LIVE", "confirm": "LIVE"}, headers={"X-App-Token": "dummy-test-token"}).status_code, 403)
        denied = client.post(
            "/api/sim/preview",
            json={
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
            headers={"X-App-Token": "dummy-test-token", "X-Requested-With": "pumpdesk"},
        )
        self.assertEqual(denied.status_code, 401)
        key = Ed25519PrivateKey.generate()
        public = key.public_key().public_bytes_raw()
        wallet = b58encode(public)
        nonce = client.post(
            "/api/session/nonce",
            json={"wallet": wallet, "cluster": "devnet"},
            headers={"X-Requested-With": "pumpdesk"},
        )
        self.assertEqual(nonce.status_code, 200, nonce.text)
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
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertIn("desk_session", verified.cookies)
        logout = client.post(
            "/api/session/logout",
            headers={"X-Requested-With": "pumpdesk", "X-CSRF-Token": verified.cookies.get("desk_csrf")},
        )
        self.assertEqual(logout.status_code, 200)
        self.assertFalse(client.get("/api/session").json()["connected"])


if __name__ == "__main__":
    unittest.main()
