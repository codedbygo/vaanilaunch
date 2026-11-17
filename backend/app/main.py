import asyncio
import base64

import anthropic
import json
import logging
import os
import re
import secrets
import time
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import config, db, notify
from .agent import Session, run_agent
from .site_render import render_site

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("vaanilaunch")
app = FastAPI(title="VaaniLaunch")
ROOT = config.ROOT_DOMAIN


def _ip(req: Request) -> str:
    # uvicorn already resolves X-Forwarded-For from trusted proxies (Caddy) into client.host;
    # reading the header ourselves would let any caller spoof it and dodge rate limits.
    return req.client.host if req.client else "?"


_hits: dict[str, list[float]] = defaultdict(list)


def _rate_limit(key: str, limit: int, window: int):
    now = time.time()
    if len(_hits) > 20_000:  # forget idle keys so memory stays bounded
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
            del _hits[k]
    _hits[key] = [t for t in _hits[key] if now - t < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(429, "Too many requests — please wait a bit.")
    _hits[key].append(now)


# ---------- Subdomain routing: <slug>.ROOT_DOMAIN serves a live store ----------
@app.middleware("http")
async def subdomain_sites(request: Request, call_next):
    host = request.headers.get("host", "").split(":")[0].lower()
    path = request.url.path
    if ROOT and host.endswith("." + ROOT) and not path.startswith(("/api/", "/media/")):
        slug = host[: -(len(ROOT) + 1)]
        if slug == "www":
            return RedirectResponse(f"https://{ROOT}{path}", status_code=301)
        site = db.get_live_site(slug)
        if not site:
            return PlainTextResponse("Store not found", status_code=404)
        return HTMLResponse(render_site(site))
    return await call_next(request)


@app.get("/s/{slug}", response_class=HTMLResponse)
async def preview(slug: str, key: str = ""):
    """Path-based view. Live stores are public; a draft needs its owner's key (sent by the app's preview)."""
    site = db.get_site(slug)
    if not site:
        raise HTTPException(404, "Store not found")
    if site.get("status") != "live" and not (key and secrets.compare_digest(site.get("edit_key", ""), key)):
        raise HTTPException(404, "Store not found")
    return render_site(site, preview=site.get("status") != "live")


@app.get("/media/{name}")
async def media(name: str):
    if not re.fullmatch(r"[a-f0-9]{16}\.jpg", name):
        raise HTTPException(404)
    path = os.path.join(db.UPLOAD_DIR, name)
    if not os.path.exists(path):
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/tls-check")
async def tls_check(domain: str = ""):
    """Caddy on-demand TLS asks here before issuing a certificate."""
    d = domain.lower().strip()
    ok = bool(ROOT) and (d in (ROOT, f"www.{ROOT}") or (d.endswith("." + ROOT) and db.get_live_site(d[: -(len(ROOT) + 1)])))
    return Response(status_code=200 if ok else 404)


@app.get("/api/sites")
async def sites():
    """Showcase of live stores."""
    out = []
    for s in db.list_live_sites()[:12]:
        img = next((p["image_id"] for p in s.get("products", []) if p.get("image_id")), None)
        out.append({"slug": s["slug"], "name": s.get("business_name"), "tagline": s.get("tagline"),
                    "city": (s.get("contact") or {}).get("city"), "url": config.site_url(s["slug"]),
                    "color": (s.get("theme") or {}).get("primary_color"),
                    "image": f"/media/{img}.jpg" if img else None,
                    "languages": [c.get("lang_label") for c in s.get("content", [])]})
    return out


@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    return "ok"


# ---------- Photo upload (frontend resizes to ~1024px JPEG first) ----------
class UploadIn(BaseModel):
    dataUrl: str = Field(max_length=4_000_000)


@app.post("/api/upload")
async def upload(body: UploadIn, request: Request):
    _rate_limit(f"up:{_ip(request)}", 60, 3600)
    m = re.fullmatch(r"data:image/jpeg;base64,([A-Za-z0-9+/=]+)", body.dataUrl)
    if not m:
        raise HTTPException(400, "Send a JPEG data URL")
    try:
        raw = base64.b64decode(m.group(1), validate=True)
    except ValueError:
        raise HTTPException(400, "Invalid image data")
    if not raw.startswith(b"\xff\xd8") or len(raw) > 2_500_000:
        raise HTTPException(400, "Invalid or too large image")
    iid = secrets.token_hex(8)
    with open(os.path.join(db.UPLOAD_DIR, f"{iid}.jpg"), "wb") as f:
        f.write(raw)
    return {"id": iid, "url": f"/media/{iid}.jpg"}


# ---------- Agent (Server-Sent Events) ----------
sessions: dict[str, Session] = {}


class AgentIn(BaseModel):
    sessionId: str = Field(min_length=8, max_length=64)
    text: str = Field(min_length=1, max_length=4000)
    images: list[str] = Field(default_factory=list, max_length=6)
    manageSlug: str | None = None
    manageKey: str | None = None


@app.post("/api/agent")
async def agent(body: AgentIn, request: Request):
    ip = _ip(request)
    _rate_limit(f"ag:{ip}", config.AGENT_REQUESTS_PER_HOUR_PER_IP, 3600)
    if body.sessionId not in sessions and len(sessions) >= 5000:  # evict the oldest idle sessions
        idle = sorted((v.last_used, k) for k, v in sessions.items() if not v.busy)
        for _, k in idle[:500]:
            del sessions[k]
    s = sessions.setdefault(body.sessionId, Session())
    if s.busy:
        raise HTTPException(429, "Agent is still working")
    s.last_used = time.time()

    text = body.text
    if body.manageSlug and body.manageKey:
        site = db.get_site(body.manageSlug)
        if not site or not secrets.compare_digest(site.get("edit_key", ""), body.manageKey):
            raise HTTPException(403, "Invalid manage link")
        if body.manageSlug not in s.owned:
            s.owned.add(body.manageSlug)
            text = f"[Owner is managing their existing store: slug={body.manageSlug}, status={site.get('status')}]\n{text}"

    s.busy = True
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(kind: str, data):
        await queue.put({"type": kind, "data": data})

    async def worker():
        try:
            await run_agent(s, text, emit, body.images, ip=ip)
        except anthropic.AuthenticationError:
            log.error("Claude API key rejected: check ANTHROPIC_API_KEY in .env, then restart")
            await emit("error", "The server's Claude API key is invalid. The owner of this server needs to fix it.")
        except (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError):
            log.exception("Claude unavailable")
            await emit("error", "Claude is busy right now. Please try again in a minute.")
        except Exception as e:
            log.exception("agent failed")
            await emit("error", str(e))
        finally:
            s.busy = False
            await queue.put(None)

    async def stream():
        task = asyncio.create_task(worker())
        try:
            while (item := await queue.get()) is not None:
                yield f"data: {json.dumps(item, ensure_ascii=False, default=str)}\n\n"
            yield 'data: {"type":"done","data":null}\n\n'
        finally:
            await task

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class ApproveIn(BaseModel):
    sessionId: str
    slug: str


@app.post("/api/approve")
async def approve(body: ApproveIn):
    """Human-in-the-loop: only a real button press by the owner unlocks publishing."""
    s = sessions.get(body.sessionId)
    if not s or body.slug not in s.owned or not db.get_site(body.slug):
        raise HTTPException(403, "Not your draft")
    s.approved.add(body.slug)
    return {"approved": True}


# ---------- Orders + UPI ----------
class OrderItem(BaseModel):
    id: str = Field(max_length=40)
    qty: int = Field(ge=1, le=50)


class OrderIn(BaseModel):
    slug: str
    items: list[OrderItem] = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=6, max_length=20)
    note: str = Field(default="", max_length=500)


@app.post("/api/orders")
async def create_order(body: OrderIn, request: Request):
    _rate_limit(f"ord:{_ip(request)}", 10, 600)
    site = db.get_site(body.slug)
    if not site:
        raise HTTPException(404, "Store not found")
    if site.get("status") != "live":
        raise HTTPException(403, "This store is a preview and not taking orders yet.")
    catalog = {p["id"]: p for p in site.get("products", []) if isinstance(p, dict) and p.get("id") and p.get("available", True)}
    lines, total = [], 0.0
    for it in body.items:  # prices always come from the server, never the browser
        p = catalog.get(it.id)
        if not p:
            raise HTTPException(400, f"Item {it.id} is not available")
        amount = round(p["price"] * it.qty, 2)
        total += amount
        lines.append({"id": it.id, "name": p.get("name"), "qty": it.qty, "price": p["price"], "amount": amount})
    total = round(total, 2)

    order = db.create_order({"slug": body.slug, "items": lines, "total": total,
                             "customer": {"name": body.name, "phone": body.phone, "note": body.note}})
    upi = site.get("upi") or {}
    pay = None
    if upi.get("vpa") and total > 0:
        link = notify.upi_link(upi["vpa"], upi.get("payee_name") or site["business_name"], total, f"Order {order['ref']}")
        pay = {"upi_link": link, "qr_svg": notify.qr_svg(link), "vpa": upi["vpa"]}

    item_txt = "\n".join(f"  • {l['name']} × {l['qty']} = ₹{l['amount']:g}" for l in lines)
    body_txt = (f"New order {order['ref']} for {site['business_name']}\n\n{item_txt}\n\nTotal: ₹{total:g}\n"
                f"Payment: pending (check your UPI app for ₹{total:g} with note 'Order {order['ref']}')\n\n"
                f"Customer: {body.name}\nPhone: {body.phone}\nNote: {body.note or '-'}\n")
    mailed = await notify.send_mail(site.get("owner_email") or config.MAIL_TO,
                                    f"🛒 New order {order['ref']} – ₹{total:g}", body_txt, bcc=config.MAIL_TO)
    return {"ref": order["ref"], "total": total, "items": lines, "status": "pending_payment",
            "pay": pay, "owner_notified": mailed}


# ---------- Contact forms -> Titan mailbox ----------
class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    slug: str | None = None


@app.post("/api/contact")
async def contact(body: ContactIn, request: Request):
    _rate_limit(f"ct:{_ip(request)}", 5, 600)
    if not notify.mail_configured():
        raise HTTPException(503, "Mail not configured")
    site = db.get_live_site(body.slug) if body.slug else None
    where = f"{site['business_name']} ({body.slug})" if site else "VaaniLaunch main site"
    ok = await notify.send_mail(
        (site or {}).get("owner_email") or config.MAIL_TO,
        f"New enquiry{' for ' + site['business_name'] if site else ''} from {body.name}",
        f"From: {body.name} <{body.email}>\nSite: {where}\n\n{body.message}",
        reply_to=body.email, bcc=config.MAIL_TO if site else None,
    )
    if not ok:
        raise HTTPException(500, "Could not send")
    return {"ok": True}


# ---------- Owner dashboard (secret manage link) ----------
def _owner_site(slug: str, key: str) -> dict:
    site = db.get_site(slug)
    if not site or not key or not secrets.compare_digest(site.get("edit_key", ""), key):
        raise HTTPException(403, "Invalid manage link")
    return site


@app.get("/api/manage")
async def manage(slug: str, key: str):
    """Store summary and recent orders for the owner's dashboard."""
    site = _owner_site(slug, key)
    return {"slug": slug, "name": site.get("business_name"), "status": site.get("status"),
            "url": config.site_url(slug), "products": len(site.get("products") or []),
            "orders": db.list_orders(slug, limit=30)}


class OrderStatusIn(BaseModel):
    slug: str
    key: str
    status: str = Field(pattern="^(paid|delivered|cancelled|pending_payment)$")


@app.post("/api/manage/orders/{ref}")
async def manage_order(ref: str, body: OrderStatusIn):
    """The owner's own button press: the one place an order may become paid without the agent."""
    _owner_site(body.slug, body.key)
    order = db.get_order(ref.upper())
    if not order or order["slug"] != body.slug:
        raise HTTPException(404, "Order not found")
    return db.set_order_status(order["ref"], body.status)


@app.get("/api/qr")
async def qr(data: str = ""):
    """QR code for a store link, so judges and customers can open it on their phones."""
    if not re.fullmatch(r"https?://[^\s]{1,290}", data):
        raise HTTPException(400, "Only http(s) links")
    return Response(notify.qr_svg(data), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------- React frontend (built files) ----------
if os.path.isdir(config.STATIC_DIR):
    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="frontend")
