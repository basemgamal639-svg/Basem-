"""Auditor on a mint with freeze authority set: red at layer 2."""
import asyncio
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from bus import Bus
from db import DB
from agents.auditor import Auditor

async def main():
    config.init()
    db = DB(Path(tempfile.mkdtemp()) / "auditor.db")
    bus = Bus()
    aud = Auditor(db, bus)

    # Monkeypatch RPC to return freeze authority set, mint revoked
    async def fake_rpc(method, params):
        if method == "getAccountInfo":
            return {
                "value": {
                    "data": {
                        "parsed": {
                            "info": {
                                "mintAuthority": None,
                                "freezeAuthority": "SomeFreeze1111111111111111111111111111111",
                            }
                        }
                    }
                }
            }
        return None
    aud._rpc = fake_rpc
    # avoid network
    async def no_http(*a, **k):
        class R:
            status_code = 404
            def json(self): return {}
        return R()
    aud.client.get = no_http

    mint = "FreezeTest11111111111111111111111111111111"
    db.upsert_coin(mint=mint, name="FreezeCoin", symbol="FRZ", migrated_at=config.now_iso())
    scan = {
        "mint": mint, "name": "FreezeCoin", "symbol": "FRZ", "pool": "Pool111",
        "liquidityUsd": 50000, "ageMin": 30, "ts": config.now_iso(),
    }
    await aud._audit(scan)
    result = db.get_audit(mint)
    assert result is not None
    assert result["passed"] is False
    assert result["layersChecked"] == 2
    assert result["reason"] == "freeze not revoked"
    layers = {L["n"]: L for L in result["layers"]}
    assert layers[1]["pass"] is True
    assert layers[2]["pass"] is False
    for n in range(3, 9):
        assert layers[n]["value"] == "not checked"
    print("PASS freeze-authority red at layer 2; 3-8 not checked")

if __name__ == "__main__":
    asyncio.run(main())
