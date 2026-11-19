import os


def load_dotenv(path: str | None = None):
    """Read KEY=value lines from the project .env for local runs. Variables already set in the
    environment win (that's how Docker's env_file and CI pass them). Tests set VAANI_NO_DOTENV."""
    if path is None:
        if os.getenv("VAANI_NO_DOTENV"):
            return
        path = os.getenv("VAANI_DOTENV") or os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


load_dotenv()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
# medium suits multi-step tool use; use low to save credits while developing
ANTHROPIC_EFFORT = os.getenv("ANTHROPIC_EFFORT", "medium")

# Model routing. claude (default) | free: which model runs the agent.
# LLM_FALLBACK=free: when Claude is unreachable, rate-limited, down or the key fails, use the free model.
_provider = os.getenv("LLM_PROVIDER", "claude").strip().lower()
# Named providers are shortcuts for the free OpenAI-compatible route with a known address.
_KNOWN_BASES = {"openrouter": "https://openrouter.ai/api/v1"}
LLM_PROVIDER = "claude" if _provider == "claude" else "free"
LLM_FALLBACK = os.getenv("LLM_FALLBACK", "none").strip().lower()
# The free model: any OpenAI-compatible chat API (OpenRouter, Gemini free tier, Groq, local Ollama).
FREE_LLM_BASE_URL = os.getenv("FREE_LLM_BASE_URL") or _KNOWN_BASES.get(_provider, "")
FREE_LLM_API_KEY = os.getenv("FREE_LLM_API_KEY") or os.getenv("OPENROUTER_API_KEY", "")
FREE_LLM_MODEL = os.getenv("FREE_LLM_MODEL") or os.getenv("AGENT_MODEL", "")
# Tried in order when the model above is rate-limited, down, or can't do tools or images.
FREE_LLM_FALLBACK_MODELS = [
    m.strip()
    for m in (os.getenv("FREE_LLM_FALLBACK_MODELS") or os.getenv("AGENT_FALLBACK_MODELS", "")).split(",")
    if m.strip()
]
# Seconds per reply. A local model on CPU can take minutes to write a whole store.
FREE_LLM_TIMEOUT = float(os.getenv("FREE_LLM_TIMEOUT", "600"))

# Speech-to-text (Sarvam AI). Empty key = the browser's own speech recognition is used instead.
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v4")
MAX_TRANSCRIBE_PER_DAY = int(os.getenv("MAX_TRANSCRIBE_PER_DAY", "500"))

# Product pictures for products without a photo (OpenRouter Image API). Empty key = dish icons.
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "recraft/recraft-v4.1-flash-v2:free")
IMAGE_API_KEY = os.getenv("IMAGE_API_KEY") or os.getenv("OPENROUTER_API_KEY", "")
MAX_IMAGES_PER_DAY = int(os.getenv("MAX_IMAGES_PER_DAY", "60"))

GODADDY_API_KEY = os.getenv("GODADDY_API_KEY", "")
GODADDY_API_SECRET = os.getenv("GODADDY_API_SECRET", "")
GODADDY_API_BASE = os.getenv("GODADDY_API_BASE", "https://api.godaddy.com")

ROOT_DOMAIN = os.getenv("ROOT_DOMAIN", "").lower()
SERVER_IP = os.getenv("SERVER_IP", "")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.titan.email")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
MAIL_TO = os.getenv("MAIL_TO", "") or SMTP_USER

DATA_DIR = os.getenv("DATA_DIR", "./data")
STATIC_DIR = os.getenv("STATIC_DIR", "../frontend/dist")

# Cost / abuse controls
MAX_CLAUDE_CALLS_PER_DAY = int(os.getenv("MAX_CLAUDE_CALLS_PER_DAY", "600"))
MAX_CLAUDE_CALLS_PER_IP_PER_DAY = int(os.getenv("MAX_CLAUDE_CALLS_PER_IP_PER_DAY", "150"))
AGENT_REQUESTS_PER_HOUR_PER_IP = int(os.getenv("AGENT_REQUESTS_PER_HOUR_PER_IP", "60"))
MAX_TURNS_PER_SESSION = int(os.getenv("MAX_TURNS_PER_SESSION", "40"))
# Share of the daily AI budget new visitors may use; the rest is kept for owners of existing stores.
NEW_VISITOR_BUDGET_SHARE = float(os.getenv("NEW_VISITOR_BUDGET_SHARE", "0.8"))
# Proof-of-work difficulty for a new visitor's first message (leading zero bits; 0 turns it off).
POW_BITS = int(os.getenv("POW_BITS", "16"))
# Customer name, phone and note are removed from orders older than this.
ORDER_PII_DAYS = int(os.getenv("ORDER_PII_DAYS", "90"))
# Uploaded photos not used by any store are deleted after this many hours.
ORPHAN_UPLOAD_HOURS = int(os.getenv("ORPHAN_UPLOAD_HOURS", "24"))


def public_base() -> str:
    """Base URL of the main app (used for manage links)."""
    return os.getenv("PUBLIC_BASE_URL") or (f"https://{ROOT_DOMAIN}" if ROOT_DOMAIN else "http://localhost:8000")


def site_url(slug: str) -> str:
    return f"https://{slug}.{ROOT_DOMAIN}" if ROOT_DOMAIN else f"{public_base()}/s/{slug}"


# ---------- Startup checks ----------
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()


def problems() -> list[str]:
    """Settings that would break or weaken a production deploy. Empty means good to go."""
    found = []
    if not ROOT_DOMAIN or not SERVER_IP:
        found.append("ROOT_DOMAIN and SERVER_IP must be set (stores live at <slug>.ROOT_DOMAIN)")
    if not (SMTP_USER and SMTP_PASS and MAIL_TO):
        found.append("SMTP_USER, SMTP_PASS and MAIL_TO must be set (order and contact emails)")
    claude_ok = bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
    free_ok = bool(FREE_LLM_BASE_URL and FREE_LLM_MODEL)
    if LLM_PROVIDER == "claude" and not claude_ok:
        found.append("ANTHROPIC_API_KEY must be set when LLM_PROVIDER=claude")
    if LLM_PROVIDER == "free" and not free_ok:
        found.append("a free model (AGENT_MODEL / FREE_LLM_*) must be set when LLM_PROVIDER is not claude")
    if LLM_FALLBACK == "free" and not free_ok:
        found.append("LLM_FALLBACK=free needs a free model (AGENT_MODEL / FREE_LLM_*)")
    if POW_BITS < 12:
        found.append("POW_BITS must be at least 12 in production (scripted floods)")
    base = os.getenv("PUBLIC_BASE_URL", "")
    if base and not base.startswith("https://"):
        found.append("PUBLIC_BASE_URL must use https:// in production")
    return found
