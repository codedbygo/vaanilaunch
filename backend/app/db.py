"""Tiny JSON-file store for sites and orders (fine for a hackathon; Postgres-ready shape)."""
import json
import os
import secrets
import threading
from datetime import datetime, timezone

from . import config

os.makedirs(config.DATA_DIR, exist_ok=True)
UPLOAD_DIR = os.path.join(config.DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

_lock = threading.Lock()
RESERVED = {"www", "api", "app", "mail", "admin", "smtp", "ftp", "email", "media", "static"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _load(name):
    try:
        with open(os.path.join(config.DATA_DIR, name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(name, data):
    path = os.path.join(config.DATA_DIR, name)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(path + ".tmp", path)


_sites: dict = _load("sites.json")
_orders: dict = _load("orders.json")


# ---------------- Sites ----------------
def get_site(slug: str):
    return _sites.get(slug)


def get_live_site(slug: str):
    s = _sites.get(slug)
    return s if s and s.get("status") == "live" else None


def slug_taken(slug: str) -> bool:
    return slug in RESERVED or slug in _sites


def save_draft(slug: str, data: dict) -> dict:
    with _lock:
        old = _sites.get(slug, {})
        # A confirmed owner email stays confirmed only while it is the same address.
        verified = bool(old.get("owner_email_verified")) and old.get("owner_email") == data.get("owner_email")
        _sites[slug] = {
            **data, "slug": slug, "status": "draft", "owner_email_verified": verified,
            "edit_key": old.get("edit_key") or secrets.token_urlsafe(16),
            "createdAt": old.get("createdAt", _now()), "updatedAt": _now(),
        }
        _save("sites.json", _sites)
        return _sites[slug]


def rotate_key(slug: str) -> str:
    """Issue a new edit key; the old manage link stops working at once."""
    with _lock:
        _sites[slug]["edit_key"] = secrets.token_urlsafe(16)
        _save("sites.json", _sites)
        return _sites[slug]["edit_key"]


def set_email_verified(slug: str, email: str) -> bool:
    with _lock:
        s = _sites.get(slug)
        if not s or (s.get("owner_email") or "").lower() != email.lower():
            return False
        s["owner_email_verified"] = True
        _save("sites.json", _sites)
        return True


def set_live(slug: str) -> dict:
    with _lock:
        s = _sites[slug]
        s["status"] = "live"
        s.setdefault("launchedAt", _now())
        s["updatedAt"] = _now()
        _save("sites.json", _sites)
        return s


def update_site(slug: str, mutate) -> dict:
    """mutate(site_dict) edits in place."""
    with _lock:
        s = _sites[slug]
        mutate(s)
        s["updatedAt"] = _now()
        _save("sites.json", _sites)
        return s


def list_live_sites():
    return sorted((s for s in _sites.values() if s.get("status") == "live"),
                  key=lambda s: s.get("launchedAt", ""), reverse=True)


# ---------------- Orders ----------------
def create_order(order: dict) -> dict:
    with _lock:
        prefix = "".join(w[0] for w in order["slug"].split("-")[:2]).upper() or "VL"
        # 16.7M refs per prefix; a few tries always find a free one, and the loop is bounded.
        for _ in range(20):
            ref = f"{prefix}-{secrets.token_hex(3).upper()}"
            if ref not in _orders:
                break
        else:
            raise RuntimeError("Could not allocate an order reference")
        _orders[ref] = {**order, "ref": ref, "status": "pending_payment", "createdAt": _now()}
        _save("orders.json", _orders)
        return _orders[ref]


def list_orders(slug: str, limit: int = 20):
    rows = [o for o in _orders.values() if o["slug"] == slug]
    return sorted(rows, key=lambda o: o["createdAt"], reverse=True)[:limit]


def get_order(ref: str):
    return _orders.get(ref)


def set_order_status(ref: str, status: str) -> dict:
    with _lock:
        _orders[ref]["status"] = status
        _orders[ref]["updatedAt"] = _now()
        _save("orders.json", _orders)
        return _orders[ref]


# ---------------- Housekeeping ----------------
def housekeeping(now: float | None = None) -> dict:
    """Delete photos no store uses after ORPHAN_UPLOAD_HOURS, and strip customer details from
    orders older than ORDER_PII_DAYS (the order, items and total stay for the owner's records)."""
    now = now or datetime.now(timezone.utc).timestamp()
    with _lock:
        used = {p.get("image_id") for s in _sites.values() for p in s.get("products") or [] if isinstance(p, dict)}
        removed = 0
        for name in os.listdir(UPLOAD_DIR):
            path = os.path.join(UPLOAD_DIR, name)
            if name.removesuffix(".jpg") not in used and now - os.path.getmtime(path) > config.ORPHAN_UPLOAD_HOURS * 3600:
                os.remove(path)
                removed += 1
        cutoff = now - config.ORDER_PII_DAYS * 86400
        purged = 0
        for o in _orders.values():
            c = o.get("customer") or {}
            if datetime.fromisoformat(o["createdAt"]).timestamp() < cutoff and c.get("phone") != "(removed)":
                o["customer"] = {"name": "(removed)", "phone": "(removed)", "note": ""}
                purged += 1
        if purged:
            _save("orders.json", _orders)
    return {"uploads_removed": removed, "orders_purged": purged}
