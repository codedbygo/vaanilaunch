import os
import sys
import tempfile

# Isolated data dir and no real credentials, set before the app is imported.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="vl-test-")
os.environ["VAANI_NO_DOTENV"] = "1"
os.environ["POW_BITS"] = "0"  # tests that check the proof-of-work turn it on themselves
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
for k in ("ROOT_DOMAIN", "SERVER_IP", "GODADDY_API_KEY", "GODADDY_API_SECRET", "SMTP_USER", "SMTP_PASS", "MAIL_TO"):
    os.environ.pop(k, None)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest  # noqa: E402
from anthropic.types.beta import BetaMessage  # noqa: E402

from app import agent, db, main  # noqa: E402


def msg(*blocks, stop="tool_use"):
    """Build a real SDK message object from plain block dicts."""
    return BetaMessage.model_validate({
        "id": "msg_x", "type": "message", "role": "assistant", "model": "test",
        "content": list(blocks), "stop_reason": stop, "stop_sequence": None,
        "usage": {"input_tokens": 1, "output_tokens": 1},
    })


def text(t):
    return {"type": "text", "text": t}


_n = [0]


def tool(name, **inp):
    _n[0] += 1
    return {"type": "tool_use", "id": f"toolu_{_n[0]:04d}", "name": name, "input": inp}


class FakeClaude:
    """Replays scripted responses and records every request it receives."""

    def __init__(self):
        self.script = []
        self.calls = []

        fake = self

        class _Messages:
            async def create(self, **kw):
                import copy
                fake.calls.append(copy.deepcopy(kw))
                item = fake.script.pop(0)
                if isinstance(item, Exception):
                    raise item
                return item

        class _Beta:
            messages = _Messages()

        self.beta = _Beta()
        self.messages = _Messages()


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    db._sites.clear()
    db._orders.clear()
    main.sessions.clear()
    main._hits.clear()
    agent._usage.update(day=None, calls=0)
    fake = FakeClaude()
    monkeypatch.setattr(agent, "client", fake)
    yield fake


@pytest.fixture
def fake(clean_state):
    return clean_state
