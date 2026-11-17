"""Email (Titan SMTP) + UPI helpers."""
import logging
import re
from email.message import EmailMessage
from urllib.parse import quote

import aiosmtplib
import qrcode
import qrcode.image.svg

from . import config

log = logging.getLogger("vaanilaunch")


def mail_configured() -> bool:
    return bool(config.SMTP_USER and config.SMTP_PASS)


_EMAIL = re.compile(r"[^@\s<>,;\"']+@[^@\s<>,;\"']+\.[A-Za-z]{2,}")


def clean_address(addr) -> str:
    """A single plain address, or "" (blocks header injection via model- or user-written values)."""
    addr = str(addr or "").strip()
    return addr if _EMAIL.fullmatch(addr) else ""


def one_line(s, limit: int = 200) -> str:
    return " ".join(str(s or "").split())[:limit]


async def send_mail(to: str, subject: str, body: str, reply_to: str | None = None, bcc: str | None = None) -> bool:
    if not mail_configured():
        log.warning("Mail not configured; skipping: %s", one_line(subject))
        return False
    to, bcc, reply_to = clean_address(to), clean_address(bcc), clean_address(reply_to)
    if not to:
        to, bcc = clean_address(config.MAIL_TO), ""
    if not to:
        log.warning("No valid recipient; skipping: %s", one_line(subject))
        return False
    msg = EmailMessage()
    msg["From"] = f"VaaniLaunch <{config.SMTP_USER}>"
    msg["To"] = to
    if bcc and bcc != to:
        msg["Bcc"] = bcc
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Subject"] = one_line(subject)
    msg.set_content(body)
    try:
        await aiosmtplib.send(msg, hostname=config.SMTP_HOST, port=config.SMTP_PORT,
                              username=config.SMTP_USER, password=config.SMTP_PASS,
                              use_tls=config.SMTP_PORT == 465, start_tls=config.SMTP_PORT == 587, timeout=20)
        return True
    except Exception as e:
        log.error("Mail error: %s", e)
        return False


def upi_link(vpa: str, payee: str, amount: float, note: str) -> str:
    return (f"upi://pay?pa={quote(vpa, safe='@')}&pn={quote(payee)}&am={amount:.2f}"
            f"&cu=INR&tn={quote(note)}")


def qr_svg(data: str) -> str:
    img = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    return img.to_string(encoding="unicode")
