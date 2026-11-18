"""Signed tokens and the proof-of-work check.

- Preview tokens: short-lived links to a private draft, so the owner's permanent edit key
  never sits in a URL, browser history or a log.
- Email tokens: confirm an owner email before the platform sends it any order or enquiry.
- Proof of work: a new visitor's browser solves a small SHA-256 puzzle (about a second)
  before its first agent turn, so scripted floods can't burn the daily AI budget cheaply.
"""
import hashlib
import hmac
import os
import secrets
import time

from . import config


def _load_secret() -> bytes:
    """One random secret per install, kept in the data folder so links survive restarts."""
    path = os.path.join(config.DATA_DIR, "secret.key")
    try:
        with open(path, "rb") as f:
            key = f.read()
        if len(key) >= 32:
            return key
    except FileNotFoundError:
        pass
    key = secrets.token_bytes(32)
    with open(path, "wb") as f:
        f.write(key)
    os.chmod(path, 0o600)
    return key


SECRET = _load_secret()


def _sig(*parts: str) -> str:
    return hmac.new(SECRET, "|".join(parts).encode(), hashlib.sha256).hexdigest()[:32]


# ---------- Preview tokens ----------
PREVIEW_TTL = 2 * 3600


def preview_token(slug: str, now: float | None = None) -> str:
    exp = str(int((now or time.time()) + PREVIEW_TTL))
    return f"{exp}.{_sig('preview', slug, exp)}"


def check_preview_token(slug: str, token: str) -> bool:
    exp, _, sig = token.partition(".")
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sig("preview", slug, exp))


# ---------- Email verification tokens ----------
def email_token(slug: str, email: str) -> str:
    return _sig("email", slug, email.lower())


def check_email_token(slug: str, email: str, token: str) -> bool:
    return hmac.compare_digest(token, email_token(slug, email))


# ---------- Proof of work ----------
POW_TTL = 600
_used: dict[str, float] = {}  # challenge -> expiry, so each solution works once


def pow_challenge(now: float | None = None) -> dict:
    exp = str(int((now or time.time()) + POW_TTL))
    rand = secrets.token_hex(8)
    return {"challenge": f"{exp}.{rand}.{_sig('pow', exp, rand)}", "bits": config.POW_BITS}


def leading_zero_bits(digest: bytes) -> int:
    bits = 0
    for byte in digest:
        if byte == 0:
            bits += 8
            continue
        return bits + (8 - byte.bit_length())
    return bits


def check_pow(challenge: str, nonce: str) -> bool:
    if config.POW_BITS <= 0:
        return True
    parts = challenge.split(".")
    if len(parts) != 3 or not parts[0].isdigit() or len(nonce) > 32:
        return False
    exp, rand, sig = parts
    now = time.time()
    if int(exp) < now or not hmac.compare_digest(sig, _sig("pow", exp, rand)) or challenge in _used:
        return False
    digest = hashlib.sha256(f"{challenge}:{nonce}".encode()).digest()
    if leading_zero_bits(digest) < config.POW_BITS:
        return False
    for c in [c for c, e in _used.items() if e < now]:  # forget expired ones
        del _used[c]
    _used[challenge] = int(exp)
    return True
