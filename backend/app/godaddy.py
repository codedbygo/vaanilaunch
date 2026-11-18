"""GoDaddy API helpers: domain availability, suggestions, DNS records.
Docs: https://developer.godaddy.com/doc/endpoint/domains
"""
import asyncio
from urllib.parse import quote

import httpx

from . import config


_transport: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport here


class GoDaddyError(Exception):
    pass


async def _gd(method: str, path: str, **kw):
    if not (config.GODADDY_API_KEY and config.GODADDY_API_SECRET):
        raise GoDaddyError("GoDaddy API key/secret not configured")
    headers = {
        "Authorization": f"sso-key {config.GODADDY_API_KEY}:{config.GODADDY_API_SECRET}",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(base_url=config.GODADDY_API_BASE, timeout=15, transport=_transport) as c:
        r = await c.request(method, path, headers=headers, **kw)
    if r.status_code >= 400:
        try:
            msg = r.json().get("message", r.text)
        except ValueError:
            msg = r.text
        raise GoDaddyError(f"GoDaddy {r.status_code}: {msg}")
    return r.json() if r.content else None


async def check_domains(domains: list[str]) -> list[dict]:
    unique = list(dict.fromkeys(d.strip().lower() for d in domains))[:10]

    async def one(domain: str):
        try:
            r = await _gd("GET", "/v1/domains/available",
                          params={"domain": domain, "checkType": "FAST", "forTransfer": "false"})
            price = r.get("price")
            return {
                "domain": domain,
                "available": bool(r.get("available")),
                "price": round(price / 1_000_000, 2) if price is not None else None,  # micro-units
                "currency": r.get("currency", "USD"),
            }
        except GoDaddyError as e:
            return {"domain": domain, "error": str(e)}

    return await asyncio.gather(*(one(d) for d in unique))


async def suggest_domains(query: str, limit: int = 8) -> list[str]:
    r = await _gd("GET", "/v1/domains/suggest",
                  params={"query": query, "limit": min(limit, 15), "waitMs": 1500})
    return [x["domain"] for x in (r or [])]


async def create_subdomain(sub: str) -> dict:
    """Create/replace A record <sub>.<ROOT_DOMAIN> -> SERVER_IP (a real agent action)."""
    if not (config.ROOT_DOMAIN and config.SERVER_IP):
        raise GoDaddyError("ROOT_DOMAIN / SERVER_IP not configured")
    await _gd("PUT", f"/v1/domains/{config.ROOT_DOMAIN}/records/A/{quote(sub)}",
              json=[{"data": config.SERVER_IP, "ttl": 600}])
    return {"record": f"{sub}.{config.ROOT_DOMAIN}", "type": "A", "points_to": config.SERVER_IP}
