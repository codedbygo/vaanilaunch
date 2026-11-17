import os


def _load_dotenv(path: str):
    """Read KEY=value lines from the project .env for local runs. Variables already set in the
    environment win (that's how Docker's env_file and CI pass them)."""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


if not os.getenv("VAANI_NO_DOTENV"):  # tests set this to stay isolated from your real .env
    _load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
# medium suits multi-step tool use; use low to save credits while developing
ANTHROPIC_EFFORT = os.getenv("ANTHROPIC_EFFORT", "medium")

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


def public_base() -> str:
    """Base URL of the main app (used for manage links)."""
    return os.getenv("PUBLIC_BASE_URL") or (f"https://{ROOT_DOMAIN}" if ROOT_DOMAIN else "http://localhost:8000")


def site_url(slug: str) -> str:
    return f"https://{slug}.{ROOT_DOMAIN}" if ROOT_DOMAIN else f"{public_base()}/s/{slug}"
