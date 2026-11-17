"""A free stand-in for api.anthropic.com, for local testing without spending credits.

It answers POST /v1/messages with a scripted launch (domains, address, catalogue from the
photos you upload, draft, publish, verify) and simple manage commands. The real backend,
tools, approval gate, orders and UI all run for real; only Claude's replies are scripted,
so it builds the same tiffin store whatever you say.

Run:   uvicorn --app-dir dev mock_claude:app --port 8765        (from backend/)
Then:  ANTHROPIC_BASE_URL=http://127.0.0.1:8765 in .env, and restart the backend.
"""
import re
import secrets

from fastapi import FastAPI, Request

app = FastAPI(title="Mock Claude (dev only)")


def tool(name: str, **inp) -> dict:
    return {"type": "tool_use", "id": f"toolu_mock_{secrets.token_hex(6)}", "name": name, "input": inp}


def text(t: str) -> dict:
    return {"type": "text", "text": t}


def reply(content: list) -> dict:
    return {
        "id": f"msg_mock_{secrets.token_hex(6)}", "type": "message", "role": "assistant", "model": "mock",
        "content": content, "stop_reason": "tool_use" if content[0]["type"] == "tool_use" else "end_turn",
        "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0},
    }


def draft(slug: str, image_ids: list[str]) -> dict:
    names = [("Idli batter", "ఇడ్లీ పిండి", 80, "per kg"), ("Dosa batter", "దోశ పిండి", 90, "per kg"),
             ("Mango pickle", "మామిడి పచ్చడి", 150, "250 g")]
    products = [{"id": f"p{i + 1}", "name": a, "name_local": b, "price": c, "unit": d,
                 "description": f"Fresh home-made {a.lower()}", "description_local": f"ఇంట్లో చేసిన {b}",
                 **({"image_id": image_ids[i]} if i < len(image_ids) else {})}
                for i, (a, b, c, d) in enumerate(names)]
    return {
        "slug": slug, "business_name": "Lakshmi Tiffins", "tagline": "Taste of home, Vijayawada",
        "theme": {"primary_color": "#c2410c"},
        "contact": {"whatsapp": "9876543210", "city": "Vijayawada", "hours": "7am-8pm"},
        "upi": {"vpa": "lakshmi@okaxis", "payee_name": "Lakshmi"}, "products": products,
        "content": [
            {"lang_code": "te", "lang_label": "తెలుగు", "hero_title": "లక్ష్మి టిఫిన్స్", "hero_subtitle": "ఇంటి రుచి, విజయవాడ",
             "cta": "ఆర్డర్ చేయండి", "about": "ఇంట్లో తాజాగా తయారు చేసిన పిండి మరియు పచ్చళ్ళు.", "products_heading": "మా మెనూ",
             "faqs": [{"q": "డెలివరీ ఉందా?", "a": "అవును, విజయవాడలో."}]},
            {"lang_code": "en", "lang_label": "English", "hero_title": "Lakshmi Tiffins", "hero_subtitle": "Taste of home, Vijayawada",
             "cta": "Order now", "about": "Fresh home-made batter and pickles.", "products_heading": "Our menu",
             "faqs": [{"q": "Do you deliver?", "a": "Yes, within Vijayawada."}]},
        ],
    }


def known_slug(msgs: list) -> str | None:
    """The store this conversation is about: one it drafted, or the one the owner manages."""
    for m in msgs:
        for b in m["content"] if isinstance(m["content"], list) else []:
            if b.get("type") == "tool_use" and b.get("name") in ("check_slug", "save_draft"):
                return b["input"]["slug"]
            if b.get("type") == "text":
                found = re.search(r"managing their existing store: slug=([a-z0-9-]+)", b["text"])
                if found:
                    return found.group(1)
    return None


@app.post("/v1/messages")
async def messages(req: Request):
    body = await req.json()
    msgs = body["messages"]
    # The latest owner message, and how many tool rounds the agent has done since.
    turn_i = max(i for i, m in enumerate(msgs)
                 if m["role"] == "user" and any(b.get("type") == "text" for b in m["content"]))
    said = " ".join(b["text"] for b in msgs[turn_i]["content"] if b.get("type") == "text").lower()
    step = sum(1 for m in msgs[turn_i + 1:] if m["role"] == "user")
    images = re.findall(r"image_id=([a-f0-9]{16})", said)
    slug = known_slug(msgs) or f"lakshmi-tiffins-{secrets.token_hex(2)}"

    if "approve" in said:
        plan = [[tool("publish_site", slug=slug)], [tool("verify_site", slug=slug)],
                [text("🎉 మీ స్టోర్ లైవ్ అయింది! Your store is live.")]]
    elif "biryani" in said or "add " in said:
        plan = [[tool("update_site", slug=slug, notice="Closed this Sunday",
                      add_products=[{"id": "p9", "name": "Sunday special biryani",
                                     "name_local": "ఆదివారం స్పెషల్ బిర్యానీ", "price": 180}])],
                [text("✅ Added Sunday special biryani for ₹180.")]]
    elif "order" in said:
        plan = [[tool("list_orders", slug=slug)], [text("Here are your orders.")]]
    else:
        plan = [[tool("suggest_domains", query="lakshmi tiffins")], [tool("check_slug", slug=slug)],
                [tool("save_draft", **draft(slug, images))],
                [text("మీ స్టోర్ ప్రివ్యూ సిద్ధంగా ఉంది. Please check the preview and tap **Approve & publish**. "
                      "Prices are suggestions. (Mock Claude: no credits used.)")]]
    return reply(plan[min(step, len(plan) - 1)])
