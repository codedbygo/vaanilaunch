"""A free backup model behind any OpenAI-compatible chat API: Google Gemini (free tier),
Groq, OpenRouter's free models, or a local Ollama.

The agent keeps its history in Claude's message format. This module translates that history
to the OpenAI shape for each call and translates the reply back into a Claude-shaped Message,
so one conversation can move between Claude and the free model at any step.
"""
import json
import logging
import secrets

import httpx
from anthropic.types import Message

from . import config

_transport: httpx.AsyncBaseTransport | None = None  # tests inject a mock transport here
log = logging.getLogger("vaanilaunch")


def configured() -> bool:
    return bool(config.FREE_LLM_BASE_URL and config.FREE_LLM_MODEL)


def _tools(tools: list) -> list:
    return [{"type": "function",
             "function": {"name": t["name"], "description": t.get("description", ""), "parameters": t["input_schema"]}}
            for t in tools]


def _user_parts(blocks: list) -> tuple[list, list]:
    """Split a Claude user turn into OpenAI tool messages and user content parts."""
    tool_msgs, parts = [], []
    for b in blocks:
        kind = b.get("type")
        if kind == "tool_result":
            content = b.get("content")
            if isinstance(content, list):
                content = "\n".join(c.get("text", "") for c in content if c.get("type") == "text")
            tool_msgs.append({"role": "tool", "tool_call_id": b["tool_use_id"], "content": str(content or "")})
        elif kind == "text":
            parts.append({"type": "text", "text": b["text"]})
        elif kind == "image" and b.get("source", {}).get("type") == "base64":
            src = b["source"]
            parts.append({"type": "image_url", "image_url": {"url": f"data:{src['media_type']};base64,{src['data']}"}})
    return tool_msgs, parts


def to_openai(system: list, messages: list) -> list:
    out = [{"role": "system", "content": "\n\n".join(b["text"] for b in system if b.get("type") == "text")}]
    for m in messages:
        blocks = m["content"] if isinstance(m["content"], list) else [{"type": "text", "text": m["content"]}]
        if m["role"] == "user":
            tool_msgs, parts = _user_parts(blocks)
            out.extend(tool_msgs)  # tool results must directly follow the assistant's tool calls
            if parts:
                out.append({"role": "user", "content": parts})
        else:
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            calls = [{"id": b["id"], "type": "function",
                      "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}), ensure_ascii=False)}}
                     for b in blocks if b.get("type") == "tool_use"]
            msg: dict = {"role": "assistant", "content": text or None}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
    return out


def from_openai(data: dict) -> Message:
    choice = data["choices"][0]
    msg = choice.get("message") or {}
    content: list = []
    if (msg.get("content") or "").strip():
        content.append({"type": "text", "text": msg["content"]})
    for call in msg.get("tool_calls") or []:
        fn = call.get("function") or {}
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}  # the tool reports the bad input and the model can retry
        content.append({"type": "tool_use", "id": call.get("id") or f"call_{secrets.token_hex(6)}",
                        "name": fn.get("name", ""), "input": args if isinstance(args, dict) else {}})
    finish = choice.get("finish_reason")
    stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else ("max_tokens" if finish == "length" else "end_turn")
    if not content:
        content.append({"type": "text", "text": "(no reply from the backup model)"})
    usage = data.get("usage") or {}
    return Message.model_validate({
        "id": data.get("id") or f"msg_{secrets.token_hex(6)}", "type": "message", "role": "assistant",
        "model": data.get("model") or config.FREE_LLM_MODEL, "content": content, "stop_reason": stop,
        "stop_sequence": None,
        "usage": {"input_tokens": usage.get("prompt_tokens", 0), "output_tokens": usage.get("completion_tokens", 0)},
    })


async def _ask(c: httpx.AsyncClient, model: str, payload: dict, headers: dict) -> Message:
    r = await c.post(f"{config.FREE_LLM_BASE_URL.rstrip('/')}/chat/completions",
                     json={**payload, "model": model}, headers=headers)
    if r.status_code == 401:
        raise PermissionError("The free model's API key was rejected: check OPENROUTER_API_KEY / FREE_LLM_API_KEY in .env")
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    # OpenRouter can report a provider failure inside a 200 body.
    if r.status_code >= 400 or "error" in data or not data.get("choices"):
        detail = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else r.text[:200]
        raise RuntimeError(f"{model}: {r.status_code} {detail}")
    return from_openai(data)


async def create(system: list, tools: list, messages: list) -> Message:
    """Ask the free model; on rate limits, outages or missing tool/image support, try the next fallback."""
    if not configured():
        raise RuntimeError("Free model not configured: set LLM_PROVIDER and AGENT_MODEL (or FREE_LLM_*) in .env")
    headers = {"Authorization": f"Bearer {config.FREE_LLM_API_KEY}", "X-Title": "VaaniLaunch"} if config.FREE_LLM_API_KEY else {}
    payload = {"messages": to_openai(system, messages), "tools": _tools(tools), "max_tokens": 8000}
    failures = []
    async with httpx.AsyncClient(timeout=config.FREE_LLM_TIMEOUT, transport=_transport) as c:
        for model in dict.fromkeys([config.FREE_LLM_MODEL, *config.FREE_LLM_FALLBACK_MODELS]):
            try:
                res = await _ask(c, model, payload, headers)
            except (RuntimeError, httpx.HTTPError, ValueError) as e:
                failures.append(str(e) or type(e).__name__)
                log.warning("Free model %s failed, trying the next one: %s", model, failures[-1])
                continue
            if failures:
                log.info("Answered by fallback model %s", model)
            return res
    raise RuntimeError("All free models failed. " + " | ".join(failures)[:600])
