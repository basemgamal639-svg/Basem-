"""Unsigned Solana message preparation for the test environment.

This builds a versioned message for a 0-lamport self-transfer. It does not sign
and it does not broadcast. It is not a Pump swap.
"""
from __future__ import annotations

import hashlib

from solders.hash import Hash
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer

SYSTEM_PROGRAM = "11111111111111111111111111111111"


def build_unsigned_self_transfer(payer: Pubkey, recent_blockhash: Hash) -> dict:
    instruction = transfer(TransferParams(from_pubkey=payer, to_pubkey=payer, lamports=0))
    message = MessageV0.try_compile(payer, [instruction], [], recent_blockhash)
    compiled = message.instructions[0]
    program = message.account_keys[compiled.program_id_index]
    if str(program) != SYSTEM_PROGRAM:
        raise RuntimeError("unexpected program id")
    data = bytes(compiled.data)
    if data[-8:] != (0).to_bytes(8, "little"):
        raise RuntimeError("lamports were not zero")
    raw = bytes(message)
    return {
        "kind": "unsigned_message_v0",
        "solana_transaction": False,
        "executable": False,
        "broadcast": False,
        "program_id": str(program),
        "lamports": 0,
        "fee_payer": str(payer),
        "message_sha256": hashlib.sha256(raw).hexdigest(),
        "message_bytes_hex": raw.hex(),
    }
