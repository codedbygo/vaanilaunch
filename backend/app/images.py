"""Product pictures for products without a photo, generated through OpenRouter's Image API.
Docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

Runs in the background after a store is built or edited, one product at a time, and saves each
picture on our own server (store pages only load images from their own site). A failure (no
key, rate limit, no credit) just leaves the dish icon in place. The owner's real photos always
win: a product that has a photo is never touched.
"""
import asyncio
import base64
import logging
import os
import secrets
import time

import httpx

from . import config, db
from .site_render import as_dict, as_list, service_key, service_names

log = logging.getLogger("vaanilaunch")

URL = "https://openrouter.ai/api/v1/images"
FOOD = {"restaurant", "home_food"}
MAX_PER_RUN = 12
MAX_BYTES = 6_000_000

_transport: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport here
_day = {"date": "", "count": 0}
_running: set[str] = set()  # stores with a generation run in progress


def available() -> bool:
    return bool(config.IMAGE_API_KEY and config.IMAGE_MODEL)


# How common dishes actually look, so the picture matches the name (image models confuse a thin
# dosa with a thick pancake). First match wins: specific dishes before general ones.
LOOKS = (
    ("masala dosa", "a thin, crispy, golden dosa folded around spiced potato filling"),
    ("pesarattu", "a thin green moong-dal crepe, crisp at the edges"),
    ("uttapam", "a thick soft rice pancake topped with onion, tomato and chilli"),
    ("dosa", "a very thin, crispy, golden-brown rice crepe, rolled or folded into a long cone or triangle"),
    ("idli", "soft, round, white steamed rice cakes"),
    ("vada", "golden, crispy, doughnut-shaped fried lentil fritters with a hole in the middle"),
    ("pongal", "creamy rice-and-moong-dal porridge topped with ghee, cashews and black pepper"),
    ("upma", "savoury semolina porridge with mustard seeds, curry leaves and vegetables"),
    ("poori", "puffed, golden, round fried wheat breads"),
    ("puri", "puffed, golden, round fried wheat breads"),
    ("biryani", "fragrant long-grain rice layered with spices"),
    ("meals", "a full South Indian meal: rice with small bowls of dal, curry, sambar, rasam and curd"),
    ("thali", "a round steel plate with rice, rotis and small bowls of curries"),
)


def _looks(name: str) -> str:
    n = name.lower()
    return next((look for key, look in LOOKS if key in n), "")


def prompt_for(site: dict, p: dict) -> str:
    """A specific, honest description: the dish or item as the owner described it."""
    what = str(p.get("name") or "").strip()
    desc = str(p.get("description") or "").strip()
    city = str(as_dict(site.get("contact")).get("city") or "").strip()
    detail = f"{what}. {desc}" if desc else what
    look = _looks(what)
    if site.get("category") in FOOD or look:
        return (f"Realistic, appetising food photograph of the Indian dish: {detail}."
                f"{f' It looks like {look}.' if look else ''} Authentic home-style presentation"
                f"{f' as served in {city}' if city else ''}, on a steel plate or banana leaf; any chutney, sambar "
                "or curry in small separate bowls beside it, never poured on top. Natural daylight, close-up, "
                "plain background, no text, no people.")
    return (f"Realistic product photograph of: {detail}. Clean, well lit, plain light background, "
            "centred, no text, no logos, no people.")


_PLACE = {"salon": "beauty salon", "coaching": "coaching class", "clinic": "clinic",
          "boutique": "tailoring boutique", "services": "local service business"}


def service_prompt(site: dict, name: str, desc: str) -> str:
    """A service is shown being done: a haircut, a facial, mehendi on hands."""
    where = _PLACE.get(str(site.get("category")), "local business")
    detail = f"{name}. {desc}" if desc else name
    return (f"Realistic photograph of this service at a clean, modern Indian {where}: {detail}. Natural light, "
            "professional and respectful, Indian people if anyone appears, no text, no logos, no watermark.")


def _count_today() -> bool:
    today = time.strftime("%Y-%m-%d")
    if _day["date"] != today:
        _day.update(date=today, count=0)
    if _day["count"] >= config.MAX_IMAGES_PER_DAY:
        return False
    _day["count"] += 1
    return True


async def generate(prompt: str) -> bytes | None:
    """One square picture, or None when it can't be made right now."""
    if not available() or not _count_today():
        return None
    body = {"model": config.IMAGE_MODEL, "prompt": prompt, "n": 1, "aspect_ratio": "1:1"}
    try:
        async with httpx.AsyncClient(timeout=120, transport=_transport) as c:
            r = await c.post(URL, json=body, headers={"Authorization": f"Bearer {config.IMAGE_API_KEY}"})
        if r.status_code != 200:
            log.warning("image generation unavailable: HTTP %s", r.status_code)
            return None
        raw = base64.b64decode(r.json()["data"][0]["b64_json"], validate=True)
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as e:
        log.warning("image generation failed: %s", type(e).__name__)
        return None
    return raw if 0 < len(raw) <= MAX_BYTES and image_type(raw) else None


def image_type(raw: bytes) -> str | None:
    """The real format of an image file, from its first bytes."""
    if raw.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


async def fill_store(slug: str) -> int:
    """Give every product without a photo a generated picture. Returns how many were added."""
    if slug in _running or not available():
        return 0
    _running.add(slug)
    added = 0
    try:
        site = db.get_site(slug) or {}
        jobs = []
        for p in missing_products(site):
            def attach(s, pid=p["id"]):
                def put(iid):
                    for q in as_list(s.get("products")):
                        # The owner may have added a real photo meanwhile: never replace it.
                        if isinstance(q, dict) and q.get("id") == pid and not q.get("image_id"):
                            q["image_id"], q["image_generated"] = iid, True
                return put
            jobs.append((prompt_for(site, p), attach))
        for name, desc in missing_services(site):
            def attach_svc(s, key=service_key(name)):
                def put(iid):
                    pics = s.get("service_images") if isinstance(s.get("service_images"), dict) else {}
                    pics.setdefault(key, iid)
                    s["service_images"] = pics
                return put
            jobs.append((service_prompt(site, name, desc), attach_svc))
        for prompt, attach in jobs[:MAX_PER_RUN]:
            raw = await generate(prompt)
            if raw is None:
                break  # no key, limit or outage: the rest keep their icons
            iid = secrets.token_hex(8)
            with open(os.path.join(db.UPLOAD_DIR, f"{iid}.jpg"), "wb") as f:
                f.write(raw)
            db.update_site(slug, lambda s, a=attach, i=iid: a(s)(i))
            added += 1
    finally:
        _running.discard(slug)
    return added


def missing_products(site: dict) -> list[dict]:
    return [p for p in as_list(site.get("products")) if isinstance(p, dict) and p.get("id") and not p.get("image_id")]


def missing_services(site: dict) -> list[tuple[str, str]]:
    """(name, description) of services without a picture, from the English block (else the first)."""
    pics = site.get("service_images") if isinstance(site.get("service_images"), dict) else {}
    langs = [b for b in as_list(site.get("content")) if isinstance(b, dict)]
    ref = next((b for b in langs if str(b.get("lang_code", "")).lower().startswith("en")), langs[0] if langs else {})
    descs = {service_key(str(s.get("name") or "")): str(s.get("description") or "")
             for s in as_list(ref.get("services")) if isinstance(s, dict)}
    seen, out = set(), []
    for name in service_names(site):
        key = service_key(name)
        if name and key not in pics and key not in seen:
            seen.add(key)
            out.append((name, descs.get(key, "")))
    return out


def schedule(slug: str) -> None:
    """Start filling a store's pictures without making the owner wait."""
    if available():
        asyncio.get_running_loop().create_task(fill_store(slug))
