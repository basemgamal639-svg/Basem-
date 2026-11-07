"""Read-only signature verification through an injected transport.

The transport is not taken from the HTTP caller. Callers pass a signature.
The adapter posts only to an allowlisted URL that also passes the DNS pin.
"""
from __future__ import annotations

from chaincheck import evaluate_fill
from rpc_allowlist import pin_resolved_host


class RpcRefused(Exception):
    pass


class RpcAdapter:
    def __init__(self, url: str, transport, resolver=None):
        ok, why = pin_resolved_host(url, resolver=resolver)
        if not ok:
            raise RpcRefused(why)
        self.url = url
        self.transport = transport

    def get_signature_statuses(self, signature: str) -> dict:
        return self.transport(
            "getSignatureStatuses",
            [[signature], {"searchTransactionHistory": True}],
        )

    def get_transaction(self, signature: str) -> dict:
        return self.transport(
            "getTransaction",
            [signature, {"encoding": "json", "commitment": "finalized", "maxSupportedTransactionVersion": 0}],
        )


def verify_signature(adapter: RpcAdapter, expected: dict) -> dict:
    signature = expected.get("signature") or ""
    if not signature:
        return {"filled": False, "reasons": ["missing signature"], "queried_network": True}
    status = adapter.get_signature_statuses(signature) or {}
    value = (status.get("value") or [None])[0]
    if isinstance(value, dict):
        value = dict(value)
        value.setdefault("signature", signature)
    transaction = adapter.get_transaction(signature)
    result = evaluate_fill(value, transaction, expected)
    result["queried_network"] = True
    result["rpc_url_host_pinned"] = True
    return result
