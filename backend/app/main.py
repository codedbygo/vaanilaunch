import asyncio
import base64
import ipaddress

import anthropic
import json
import logging
import os
import re
import secrets
import shutil
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import config, db, mail_text, notify, observability, security, verify
from .agent import BudgetExceeded, Session, run_agent
from .site_render import as_dict, as_list, render_site, store_csp

observability.setup(json_logs=os.getenv("LOG_FORMAT", "json" if config.APP_ENV == "production" else "text") == "json")
log = logging.getLogger("vaanilaunch")


def check_config() -> list[str]:
    """Production refuses to start with unsafe settings; development only warns."""
    found = config.problems()
    for p in found:
        log.warning("config: %s", p)
    if found and config.APP_ENV == "production":
        raise RuntimeError("Refusing to start in production: " + "; ".join(found))
    return found
HOUSEKEEPING_EVERY = 6 * 3600


async def _housekeeping_loop():
    while True:
        try:
            log.info("housekeeping: %s", db.housekeeping())
        except Exception:  # never let cleanup take the app down
            log.exception("housekeeping failed")
        await asyncio.sleep(HOUSEKEEPING_EVERY)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    check_config()
    task = asyncio.create_task(_housekeeping_loop())
    yield
    task.cancel()


app = FastAPI(title="VaaniLaunch", lifespan=lifespan)
ROOT = config.ROOT_DOMAIN


class _RedactKeys(logging.Filter):
    """Edit keys are owner credentials: keep them out of the access log."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(re.sub(r"key=[^&\s\"]+", "key=REDACTED", a) if isinstance(a, str) else a
                                for a in record.args)
        return True


logging.getLogger("uvicorn.access").addFilter(_RedactKeys())


def _ip(req: Request) -> str:
    # uvicorn already resolves X-Forwarded-For from trusted proxies (Caddy) into client.host;
    # reading the header ourselves would let any caller spoof it and dodge rate limits.
    host = req.client.host if req.client else "?"
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return host
    # One IPv6 customer usually owns a whole /64; keying on single addresses would let them rotate freely.
    return str(ipaddress.ip_network(f"{addr}/64", strict=False)) if addr.version == 6 else host


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
        return _store_page(site)
    return await call_next(request)


# Only this app (and the platform domain, which previews live stores) may frame its pages.
_ANCESTORS = f"'self' https://{ROOT}" if ROOT else "'self'"
_STORE_ORIGINS = f" https://*.{ROOT}" if ROOT else ""
# The React app: no inline scripts (Vite emits modules); inline styles come from toasts and React style props.
_APP_CSP = (f"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            f"img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
            f"frame-src 'self'{_STORE_ORIGINS}; frame-ancestors {_ANCESTORS}; "
            f"base-uri 'none'; form-action 'self'; object-src 'none'")


# Body limits checked before anything reads the body (a huge body would otherwise be buffered whole).
_UPLOAD_LIMIT = 4_500_000
_BODY_LIMIT = 256_000


@app.middleware("http")
async def request_ids(request: Request, call_next):
    rid = observability.new_request_id(request.headers.get("x-request-id"))
    token = observability.request_id.set(rid)
    try:
        response = await call_next(request)
    finally:
        observability.request_id.reset(token)
    response.headers["X-Request-ID"] = rid
    return response


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.method == "POST" and request.url.path.startswith("/api/"):
        size = request.headers.get("content-length")
        limit = _UPLOAD_LIMIT if request.url.path == "/api/upload" else _BODY_LIMIT
        if size is None or not size.isdigit():
            return PlainTextResponse("Content-Length required", status_code=411)
        if int(size) > limit:
            return PlainTextResponse("Request too large", status_code=413)
        # JSON only: a cross-site form or no-cors post can't send this content type without a preflight.
        if not request.headers.get("content-type", "").startswith("application/json"):
            return PlainTextResponse("Send JSON", status_code=415)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Draft previews carry a token in the URL; never send it to wa.me or other sites.
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Store pages set their own policy (_store_page); everything else is the React app or the API.
    response.headers.setdefault("Content-Security-Policy", _APP_CSP)
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    return response


def _store_page(site: dict, preview: bool = False) -> HTMLResponse:
    page = render_site(site, preview=preview, url=config.site_url(site.get("slug") or ""), media_base=config.public_base())
    return HTMLResponse(page, headers={"Content-Security-Policy": store_csp(_ANCESTORS)})


@app.api_route("/s/{slug}", methods=["GET", "HEAD"])
async def preview(slug: str, t: str = ""):
    """Path-based view. Live stores are public; a draft needs a short-lived preview token (?t=),
    never the owner's permanent key, so nothing lasting ends up in browser history."""
    site = db.get_site(slug)
    if not site:
        raise HTTPException(404, "Store not found")
    draft = site.get("status") != "live"
    if draft and not (t and security.check_preview_token(slug, t)):
        raise HTTPException(404, "Store not found")
    return _store_page(site, preview=draft)


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
        products = [p for p in as_list(s.get("products")) if isinstance(p, dict)]
        img = next((p["image_id"] for p in products if p.get("image_id")), None)
        out.append({"slug": s["slug"], "name": s.get("business_name"), "tagline": s.get("tagline"),
                    "city": as_dict(s.get("contact")).get("city"), "url": config.site_url(s["slug"]),
                    "color": as_dict(s.get("theme")).get("primary_color"),
                    "image": f"/media/{img}.jpg" if img else None,
                    "languages": [c.get("lang_label") for c in as_list(s.get("content")) if isinstance(c, dict)]})
    return out


@app.get("/healthz", response_class=PlainTextResponse)
async def healthz():
    """Liveness: the process answers."""
    return "ok"


MIN_FREE_DISK = 200 * 1024 * 1024


@app.get("/readyz")
async def readyz():
    """Readiness: the database accepts writes and the data disk has room. Docker's health check uses this."""
    checks = {}
    try:
        checks["database"] = db.ping()
    except Exception:
        log.exception("readiness: database check failed")
        checks["database"] = False
    checks["disk"] = shutil.disk_usage(config.DATA_DIR).free > MIN_FREE_DISK
    ok = all(checks.values())
    return JSONResponse({"ok": ok, **checks}, status_code=200 if ok else 503)


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


class PowIn(BaseModel):
    challenge: str = Field(max_length=120)
    nonce: str = Field(max_length=32)


class AgentIn(BaseModel):
    sessionId: str = Field(min_length=8, max_length=64)
    text: str = Field(min_length=1, max_length=4000)
    images: list[Annotated[str, Field(max_length=32)]] = Field(default_factory=list, max_length=6)
    manageSlug: str | None = None
    manageKey: str | None = None
    pow: PowIn | None = None


@app.get("/api/pow")
async def pow_challenge():
    """A small puzzle a new visitor's browser solves before its first message (see security.py)."""
    return security.pow_challenge()


@app.post("/api/agent")
async def agent(body: AgentIn, request: Request):
    ip = _ip(request)
    _rate_limit(f"ag:{ip}", config.AGENT_REQUESTS_PER_HOUR_PER_IP, 3600)
    if body.sessionId not in sessions and len(sessions) >= 5000:  # evict the oldest idle sessions
        idle = sorted((v.last_used, k) for k, v in sessions.items() if not v.busy)
        for _, k in idle[:500]:
            del sessions[k]
    managing = bool(body.manageSlug and body.manageKey)
    site = None
    if managing:
        site = db.get_site(body.manageSlug)
        if not site or not secrets.compare_digest(site.get("edit_key", ""), body.manageKey):
            raise HTTPException(403, "Invalid manage link")
    # A brand-new visitor (no session yet, no manage link) must solve the proof-of-work puzzle first.
    if body.sessionId not in sessions and not managing:
        if config.POW_BITS > 0 and not (body.pow and security.check_pow(body.pow.challenge, body.pow.nonce)):
            raise HTTPException(428, "Please reload the page and try again.")
    s = sessions.setdefault(body.sessionId, Session())
    if s.busy:
        raise HTTPException(429, "Agent is still working")
    s.last_used = time.time()

    text = body.text
    if managing and body.manageSlug not in s.introduced:
        # Tell the model which store this is, once per session (ownership alone may come from /api/approve).
        s.owned.add(body.manageSlug)
        s.introduced.add(body.manageSlug)
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
        except BudgetExceeded as e:
            await emit("error", str(e))
        except PermissionError as e:  # the free model's key was rejected
            log.error("%s", e)
            await emit("error", "The server's AI key is invalid. The owner of this server needs to fix it.")
        except Exception:
            # Details (provider bodies, stack traces) go to the server log, never to the visitor.
            log.exception("agent failed")
            await emit("error", "The AI is busy or unavailable right now. Please try again in a minute.")
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
    sessionId: str = Field(min_length=8, max_length=64)
    slug: str = Field(max_length=64)
    key: str | None = Field(default=None, max_length=128)  # the owner's private key, if the browser has it


@app.post("/api/approve")
async def approve(body: ApproveIn):
    """Human-in-the-loop: only a real button press by the owner unlocks publishing.
    Sessions live in memory, so after a server restart the owner's private key re-proves ownership."""
    site = db.get_site(body.slug)
    s = sessions.get(body.sessionId)
    if site and body.key and secrets.compare_digest(site.get("edit_key", ""), body.key):
        s = sessions.setdefault(body.sessionId, Session())
        s.owned.add(body.slug)
    if not s or body.slug not in s.owned or not site:
        raise HTTPException(403, "Not your draft")
    if s.busy:  # the draft may still be changing; approve what the owner actually saw
        raise HTTPException(409, "The agent is still working on your store. Approve when it finishes.")
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
    catalog = {p["id"]: p for p in as_list(site.get("products")) if isinstance(p, dict) and p.get("id") and p.get("available", True)}
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
    upi = as_dict(site.get("upi"))
    pay = None
    if upi.get("vpa") and total > 0:
        link = notify.upi_link(upi["vpa"], upi.get("payee_name") or site["business_name"], total, f"Order {order['ref']}")
        pay = {"upi_link": link, "qr_svg": notify.qr_svg(link), "vpa": upi["vpa"]}

    item_txt = "\n".join(f"  • {l['name']} × {l['qty']} = ₹{l['amount']:g}" for l in lines)
    # In the owner's language with English below (the copy to the platform inbox reads it too).
    subject, body_txt = mail_text.order_mail(site, order["ref"], item_txt, total, body.phone,
                                             body.name, body.note)
    mailed = await notify.send_mail(verify.owner_inbox(site), subject, body_txt, bcc=config.MAIL_TO)
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
        verify.owner_inbox(site) if site else config.MAIL_TO,
        f"New enquiry{' for ' + site['business_name'] if site else ''} from {body.name}",
        f"Site: {where}\nReply-to: {body.email}\n\n--- Written by the visitor, not by VaaniLaunch. Don't open links you don't trust. ---\nFrom: {body.name}\n\n{body.message}",
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


class ManageIn(BaseModel):
    slug: str = Field(max_length=64)
    key: str = Field(max_length=128)


def launch_checklist(site: dict) -> list[dict]:
    """What the store really has, item by item; the dashboard's readiness score is done/total.
    The SEO items count what the page actually renders (it falls back to the tagline)."""
    c, seo = as_dict(site.get("contact")), as_dict(site.get("seo"))
    langs = [b for b in as_list(site.get("content")) if isinstance(b, dict)]
    items = {
        "name": site.get("business_name"),
        "description": any(str(b.get("about") or "").strip() for b in langs),
        "photos": any(isinstance(p, dict) and p.get("image_id") for p in as_list(site.get("products"))),
        "phone": c.get("phone") or c.get("whatsapp"),
        "hours": c.get("hours"),
        "location": c.get("city") or c.get("address"),
        "seo_title": seo.get("title") or (site.get("business_name") and site.get("tagline")),
        "seo_description": seo.get("description") or site.get("tagline"),
        "published": site.get("status") == "live",
    }
    return [{"key": k, "done": bool(v)} for k, v in items.items()]


@app.post("/api/manage")
async def manage(body: ManageIn):
    """Store summary and recent orders for the owner's dashboard. POST so the key never sits in a URL or log."""
    slug = body.slug
    site = _owner_site(slug, body.key)
    return {"slug": slug, "name": site.get("business_name"), "status": site.get("status"),
            "url": config.site_url(slug), "products": len(site.get("products") or []),
            "preview_token": security.preview_token(slug),
            "owner_email": site.get("owner_email"), "owner_email_verified": bool(site.get("owner_email_verified")),
            "orders": db.list_orders(slug, limit=30), "checklist": launch_checklist(site)}


@app.post("/api/manage/rotate")
async def rotate(body: ManageIn):
    """Replace the owner's private link, e.g. after it was shared by mistake. The old link stops working."""
    _owner_site(body.slug, body.key)
    return {"slug": body.slug, "key": db.rotate_key(body.slug)}


@app.get("/api/verify-email", response_class=HTMLResponse)
async def verify_email(slug: str = "", email: str = "", t: str = ""):
    """The link in the confirmation email. Only after this do orders go to the owner's address."""
    ok = bool(slug and email and t) and security.check_email_token(slug, email, t) and db.set_email_verified(slug, email)
    msg = ("✅ Email confirmed. Order emails for your store will now come to this address."
           if ok else "This confirmation link is invalid or out of date.")
    return HTMLResponse(f"<!doctype html><meta charset=utf-8><title>VaaniLaunch</title>"
                        f"<p style='font:18px system-ui;margin:3rem auto;max-width:32rem'>{msg}</p>",
                        status_code=200 if ok else 400)


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
def mount_frontend(path: str) -> bool:
    """Serve the built React app at / when it exists (it doesn't in a backend-only dev run)."""
    if not os.path.isdir(path):
        return False
    app.mount("/", StaticFiles(directory=path, html=True), name="frontend")
    return True


mount_frontend(config.STATIC_DIR)
