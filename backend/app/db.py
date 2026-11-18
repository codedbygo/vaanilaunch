"""Store for sites and orders: SQLite on disk, with an in-memory copy for fast reads.

Every write updates one row inside a transaction (WAL journal, crash-safe), instead of rewriting
a whole JSON file. The process holds the only connection (the app runs one worker), so the
in-memory copy is always current. Older installs that used sites.json / orders.json are imported
once on first start.
"""
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timezone

from . import config

os.makedirs(config.DATA_DIR, exist_ok=True)
UPLOAD_DIR = os.path.join(config.DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
DB_PATH = os.path.join(config.DATA_DIR, "vaanilaunch.db")

_lock = threading.Lock()
RESERVED = {"www", "api", "app", "mail", "admin", "smtp", "ftp", "email", "media", "static"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS sites (slug TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
    ref TEXT PRIMARY KEY, slug TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_by_slug ON orders (slug, created_at);
"""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript(SCHEMA)
    return conn


def _load(name, data_dir=None):
    """Read a legacy JSON file; a missing or corrupt file reads as empty."""
    try:
        with open(os.path.join(data_dir or config.DATA_DIR, name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _import_legacy(conn: sqlite3.Connection, data_dir: str) -> int:
    """Move sites.json / orders.json into SQLite once, then rename them so it never runs twice."""
    if conn.execute("SELECT EXISTS (SELECT 1 FROM sites) OR EXISTS (SELECT 1 FROM orders)").fetchone()[0]:
        return 0
    sites, orders = _load("sites.json", data_dir), _load("orders.json", data_dir)
    if not sites and not orders:
        return 0
    with conn:
        conn.execute("BEGIN")
        conn.executemany("INSERT INTO sites (slug, data) VALUES (?, ?)",
                         [(k, json.dumps(v, ensure_ascii=False)) for k, v in sites.items()])
        conn.executemany("INSERT INTO orders (ref, slug, created_at, data) VALUES (?, ?, ?, ?)",
                         [(k, v["slug"], v["createdAt"], json.dumps(v, ensure_ascii=False)) for k, v in orders.items()])
    for name in ("sites.json", "orders.json"):
        path = os.path.join(data_dir, name)
        if os.path.exists(path):
            os.replace(path, path + ".migrated")
    return len(sites) + len(orders)


def _read_all(conn: sqlite3.Connection) -> tuple[dict, dict]:
    sites = {slug: json.loads(data) for slug, data in conn.execute("SELECT slug, data FROM sites")}
    orders = {ref: json.loads(data) for ref, data in conn.execute("SELECT ref, data FROM orders")}
    return sites, orders


_conn = _connect(DB_PATH)
_import_legacy(_conn, config.DATA_DIR)
_sites, _orders = _read_all(_conn)


def _put_site(slug: str):
    _conn.execute("INSERT INTO sites (slug, data) VALUES (?, ?) ON CONFLICT (slug) DO UPDATE SET data = excluded.data",
                  (slug, json.dumps(_sites[slug], ensure_ascii=False)))


def _put_order(ref: str):
    o = _orders[ref]
    _conn.execute("INSERT INTO orders (ref, slug, created_at, data) VALUES (?, ?, ?, ?) "
                  "ON CONFLICT (ref) DO UPDATE SET data = excluded.data",
                  (ref, o["slug"], o["createdAt"], json.dumps(o, ensure_ascii=False)))


def ping() -> bool:
    """Readiness: the database answers and accepts writes."""
    _conn.execute("CREATE TABLE IF NOT EXISTS _ping (x INTEGER)")
    return _conn.execute("SELECT 1").fetchone()[0] == 1


def backup(dest: str) -> str:
    """Consistent online copy of the database (safe while the app is serving)."""
    with sqlite3.connect(dest) as target:
        _conn.backup(target)
    return dest


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
        _put_site(slug)
        return _sites[slug]


def rotate_key(slug: str) -> str:
    """Issue a new edit key; the old manage link stops working at once."""
    with _lock:
        _sites[slug]["edit_key"] = secrets.token_urlsafe(16)
        _put_site(slug)
        return _sites[slug]["edit_key"]


def set_email_verified(slug: str, email: str) -> bool:
    with _lock:
        s = _sites.get(slug)
        if not s or (s.get("owner_email") or "").lower() != email.lower():
            return False
        s["owner_email_verified"] = True
        _put_site(slug)
        return True


def set_live(slug: str) -> dict:
    with _lock:
        s = _sites[slug]
        s["status"] = "live"
        s.setdefault("launchedAt", _now())
        s["updatedAt"] = _now()
        _put_site(slug)
        return s


def update_site(slug: str, mutate) -> dict:
    """mutate(site_dict) edits in place."""
    with _lock:
        s = _sites[slug]
        mutate(s)
        s["updatedAt"] = _now()
        _put_site(slug)
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
        _put_order(ref)
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
        _put_order(ref)
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
        for ref, o in _orders.items():
            c = o.get("customer") or {}
            if datetime.fromisoformat(o["createdAt"]).timestamp() < cutoff and c.get("phone") != "(removed)":
                o["customer"] = {"name": "(removed)", "phone": "(removed)", "note": ""}
                _put_order(ref)
                purged += 1
    return {"uploads_removed": removed, "orders_purged": purged}
