"""Speech-to-text through Sarvam AI, built for Indian languages and noisy audio.
Docs: https://docs.sarvam.ai/api-reference/speech-to-text/transcribe

The browser records with noise suppression and sends one clip (at most 30 seconds, Sarvam's
limit for this endpoint) per request. The key stays on the server. Without a key, or when the
credit runs out, the app falls back to the browser's own speech recognition.
"""
import time

import httpx

from . import config

URL = "https://api.sarvam.ai/speech-to-text"
LANGS = {"te-IN", "hi-IN", "ta-IN", "kn-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "en-IN"}
MIME = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav"}
MAX_BYTES = 1_500_000  # 30 s of Opus is ~120 kB; this leaves room for wav and m4a

_transport: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport here
_day = {"date": "", "count": 0}  # daily cap so a free credit can't be drained by one bad day


class SpeechError(Exception):
    """The speech service can't be used right now; the browser falls back to its own recognizer."""


def available() -> bool:
    return bool(config.SARVAM_API_KEY)


def _count_today() -> None:
    today = time.strftime("%Y-%m-%d")
    if _day["date"] != today:
        _day.update(date=today, count=0)
    if _day["count"] >= config.MAX_TRANSCRIBE_PER_DAY:
        raise SpeechError("daily transcription limit reached")
    _day["count"] += 1


async def transcribe(audio: bytes, mime: str, lang: str) -> str:
    if not available():
        raise SpeechError("speech service not configured")
    _count_today()
    files = {"file": (f"voice.{MIME[mime]}", audio, mime)}
    data = {"model": config.SARVAM_STT_MODEL, "language_code": lang}
    try:
        async with httpx.AsyncClient(timeout=30, transport=_transport) as c:
            r = await c.post(URL, files=files, data=data,
                             headers={"api-subscription-key": config.SARVAM_API_KEY})
    except httpx.HTTPError as e:
        raise SpeechError(f"speech service unreachable: {type(e).__name__}") from e
    if r.status_code != 200:
        # 403 bad key, 402 credit used up, 429 rate limit, 5xx overloaded: all mean "fall back".
        raise SpeechError(f"speech service {r.status_code}")
    try:
        return str(r.json().get("transcript") or "").strip()
    except ValueError as e:
        raise SpeechError("speech service sent an unreadable answer") from e
