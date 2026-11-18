"""Logging for production: one JSON object per line, with the request ID on every line.

Each request gets an ID (the proxy's X-Request-ID if it looks sane, otherwise a new one). It is
returned in the X-Request-ID response header and stamped on every log line written while the
request runs, so one customer's problem can be found in the logs from the ID they report.
"""
import contextvars
import json
import logging
import re
import uuid

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_SANE_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")


def new_request_id(incoming: str | None) -> str:
    return incoming if incoming and _SANE_ID.fullmatch(incoming) else uuid.uuid4().hex


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup(json_logs: bool) -> None:
    """Route the app's and uvicorn's logs through one handler with request IDs."""
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter() if json_logs else
                         logging.Formatter("%(levelname)s [%(request_id)s] %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
