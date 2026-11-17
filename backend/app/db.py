"""Tiny JSON-file store for sites and orders (fine for a hackathon; Postgres-ready shape)."""
import json
import os
import random
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
        _sites[slug] = {
            **data, "slug": slug, "status": "draft",
            "edit_key": old.get("edit_key") or secrets.token_urlsafe(16),
            "createdAt": old.get("createdAt", _now()), "updatedAt": _now(),
        }
        _save("sites.json", _sites)
        return _sites[slug]


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
        while True:
            ref = f"{prefix}-{random.randint(1000, 9999)}"
            if ref not in _orders:
                break
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
