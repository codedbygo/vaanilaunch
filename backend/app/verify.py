"""Owner email confirmation.

An owner email typed into the agent is unverified. Until the owner clicks the link we send,
order and enquiry emails go only to the platform's own inbox, so nobody can point VaaniLaunch's
mailbox at a stranger.
"""
from urllib.parse import urlencode

from . import config, notify, security

_sent: set[tuple[str, str]] = set()  # one confirmation mail per store and address per run


def confirm_link(slug: str, email: str) -> str:
    q = urlencode({"slug": slug, "email": email, "t": security.email_token(slug, email)})
    return f"{config.public_base()}/api/verify-email?{q}"


async def request_owner_email(slug: str, email: str) -> str:
    """Send the confirmation link once; returns a short status for the agent to relay."""
    if (slug, email.lower()) in _sent:
        return "confirmation email already sent; orders go to the platform inbox until it is confirmed"
    body = (f"Please confirm that order emails for your VaaniLaunch store '{slug}' should come to this address:\n\n"
            f"{confirm_link(slug, email)}\n\n"
            "If you didn't set up this store, ignore this email and nothing will be sent to you.")
    sent = await notify.send_mail(email, "Confirm your VaaniLaunch order email", body)
    if not sent:
        return "could not send the confirmation email; orders go to the platform inbox"
    _sent.add((slug, email.lower()))
    return "confirmation email sent; orders go to the platform inbox until the owner clicks the link"


def owner_inbox(site: dict) -> str:
    """Where a store's order and enquiry emails go: its owner only once confirmed."""
    if site.get("owner_email") and site.get("owner_email_verified"):
        return site["owner_email"]
    return config.MAIL_TO
