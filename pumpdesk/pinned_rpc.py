"""RPC POST that connects to one approved address and keeps the TLS name.

The check and the connect use the same resolver result. Redirects are refused.
HTTP(S)_PROXY is ignored. This does not send transactions.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

from rpc_allowlist import validate_rpc_url


class RpcRefused(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _mapped(addr: ipaddress._BaseAddress):
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return addr.ipv4_mapped
    return addr


def address_blocked(ip: str, *, allow_loopback: bool) -> bool:
    text = ip.split("%", 1)[0]
    addr = _mapped(ipaddress.ip_address(text))
    if allow_loopback and addr.is_loopback:
        return False
    return bool(
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def resolve(host: str, resolver=None) -> list[str]:
    if resolver is not None:
        return list(resolver(host))
    return [item[4][0] for item in socket.getaddrinfo(host, None)]


def choose_address(url: str, resolver=None) -> tuple[str, str, int | None]:
    ok, why = validate_rpc_url(url)
    if not ok:
        raise RpcRefused(why)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    allow_loopback = host in ("localhost", "127.0.0.1", "::1")
    try:
        answers = resolve(host, resolver)
    except Exception as exc:
        raise RpcRefused("rpc host did not resolve") from exc
    if not answers:
        raise RpcRefused("rpc host did not resolve")
    if any(address_blocked(ip, allow_loopback=allow_loopback) for ip in answers):
        raise RpcRefused("resolved address is blocked")
    return host, answers[0], parsed.port


async def post_json(url: str, payload: dict, resolver=None, transport=None) -> httpx.Response:
    host, ip, port = choose_address(url, resolver)
    parsed = urlparse(url)
    literal = f"[{ip}]" if ":" in ip else ip
    netloc = f"{literal}:{port}" if port else literal
    target = f"{parsed.scheme}://{netloc}{parsed.path or '/'}"
    host_header = host if port in (None, 443, 80) else f"{host}:{port}"
    request = httpx.Request("POST", target, json=payload, headers={"Host": host_header})
    request.extensions["sni_hostname"] = host
    client = httpx.AsyncClient(transport=transport, trust_env=False, follow_redirects=False, timeout=20.0)
    async with client:
        response = await client.send(request)
    if response.is_redirect:
        raise RpcRefused("redirect refused")
    return response
