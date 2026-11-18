"""Edge cases and failure paths, so every line and branch of the backend is exercised."""
import asyncio
import hashlib
import json
import logging
import os
import time

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import agent, config, db, free_llm, godaddy, main, notify, security, site_render, verify
from conftest import msg, text, tool
from test_app import DRAFT, SID, _live_store, api, run, steps, upload


def _req():
    return httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def _mail(monkeypatch, ok=True):
    monkeypatch.setattr(config, "SMTP_USER", "a@b.in")
    monkeypatch.setattr(config, "SMTP_PASS", "x")
    monkeypatch.setattr(config, "MAIL_TO", "ops@b.in")
    sent = []

    async def fake_send(m, **kw):
        if not ok:
            raise OSError("smtp down")
        sent.append(m)
    monkeypatch.setattr(notify.aiosmtplib, "send", fake_send)
    return sent


def _owned(slug="shop-one"):
    main.sessions[SID] = main.Session()
    main.sessions[SID].owned.add(slug)
    return main.sessions[SID]


# ---------------- config ----------------
def test_dotenv_loader(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# comment\n\nVL_A=1\nVL_B = \"two\"\nVL_C='three'\nnot a pair\nVL_A=ignored\n")
    for k in ("VL_A", "VL_B", "VL_C", "VL_D"):
        monkeypatch.delenv(k, raising=False)
    config.load_dotenv(str(env))
    assert (os.environ["VL_A"], os.environ["VL_B"], os.environ["VL_C"]) == ("1", "two", "three")
    config.load_dotenv(str(tmp_path / "missing.env"))  # a missing file is fine
    monkeypatch.setenv("VAANI_NO_DOTENV", "1")
    config.load_dotenv()  # tests opt out
    monkeypatch.delenv("VAANI_NO_DOTENV")
    (tmp_path / "other.env").write_text("VL_D=4\n")
    monkeypatch.setenv("VAANI_DOTENV", str(tmp_path / "other.env"))
    config.load_dotenv()
    assert os.environ["VL_D"] == "4"


def test_site_url_with_root_domain(monkeypatch):
    monkeypatch.setattr(config, "ROOT_DOMAIN", "vaani.in")
    assert config.site_url("shop") == "https://shop.vaani.in"
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)
    assert config.public_base() == "https://vaani.in"


# ---------------- db ----------------
def test_db_load_existing_and_corrupt_files(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", str(tmp_path))
    (tmp_path / "good.json").write_text('{"a": 1}')
    (tmp_path / "bad.json").write_text("{not json")
    assert db._load("good.json") == {"a": 1}
    assert db._load("bad.json") == {}
    assert db._load("none.json") == {}


def test_order_ref_allocation_gives_up_instead_of_looping(monkeypatch):
    _live_store()
    monkeypatch.setattr(db.secrets, "token_hex", lambda n: "abcdef")
    db._orders["SO-ABCDEF"] = {"slug": "shop-one"}
    with pytest.raises(RuntimeError):
        db.create_order({"slug": "shop-one", "items": [], "total": 0, "customer": {}})


def test_rotate_key_and_email_verification_in_db():
    _live_store(owner_email="Owner@Shop.in")
    old = db.get_site("shop-one")["edit_key"]
    new = db.rotate_key("shop-one")
    assert new != old and db.get_site("shop-one")["edit_key"] == new
    assert db.set_email_verified("shop-one", "other@shop.in") is False
    assert db.set_email_verified("missing", "x@y.in") is False
    assert db.set_email_verified("shop-one", "owner@shop.in") is True
    # re-saving the draft with the same address keeps it confirmed; a new address resets it
    db.save_draft("shop-one", {"business_name": "S", "owner_email": "Owner@Shop.in"})
    assert db.get_site("shop-one")["owner_email_verified"] is True
    db.save_draft("shop-one", {"business_name": "S", "owner_email": "new@shop.in"})
    assert db.get_site("shop-one")["owner_email_verified"] is False


def test_housekeeping_removes_orphans_and_old_customer_details(monkeypatch):
    used = upload()
    orphan = upload()
    _live_store(products=[{"id": "p1", "name": "A", "price": 10, "image_id": used}])
    old = time.time() - 48 * 3600
    for iid in (used, orphan):
        os.utime(os.path.join(db.UPLOAD_DIR, f"{iid}.jpg"), (old, old))
    fresh = upload()
    o = db.create_order({"slug": "shop-one", "items": [], "total": 10,
                         "customer": {"name": "Ravi", "phone": "9000000001", "note": "gate 2"}})
    o["createdAt"] = "2020-01-01T00:00:00+00:00"
    first = db.housekeeping()
    assert first == {"uploads_removed": 1, "orders_purged": 1}
    assert not os.path.exists(os.path.join(db.UPLOAD_DIR, f"{orphan}.jpg"))
    assert os.path.exists(os.path.join(db.UPLOAD_DIR, f"{used}.jpg"))
    assert os.path.exists(os.path.join(db.UPLOAD_DIR, f"{fresh}.jpg"))
    assert db.get_order(o["ref"])["customer"] == {"name": "(removed)", "phone": "(removed)", "note": ""}
    assert db.get_order(o["ref"])["total"] == 10
    assert db.housekeeping() == {"uploads_removed": 0, "orders_purged": 0}  # idempotent


# ---------------- security ----------------
def test_secret_is_created_once_and_reused(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", str(tmp_path))
    first = security._load_secret()
    assert len(first) == 32 and oct(os.stat(tmp_path / "secret.key").st_mode)[-3:] == "600"
    assert security._load_secret() == first
    (tmp_path / "secret.key").write_bytes(b"short")
    assert security._load_secret() != b"short"


def test_preview_and_email_tokens():
    tok = security.preview_token("shop")
    assert security.check_preview_token("shop", tok)
    assert not security.check_preview_token("other", tok)
    assert not security.check_preview_token("shop", security.preview_token("shop", now=time.time() - 3 * 3600))
    assert not security.check_preview_token("shop", "garbage")
    e = security.email_token("shop", "A@B.in")
    assert security.check_email_token("shop", "a@b.in", e) and not security.check_email_token("shop", "c@b.in", e)


def _solve(challenge, bits):
    n = 0
    while security.leading_zero_bits(hashlib.sha256(f"{challenge}:{n}".encode()).digest()) < bits:
        n += 1
    return str(n)


def test_proof_of_work(monkeypatch):
    monkeypatch.setattr(config, "POW_BITS", 8)
    assert security.leading_zero_bits(b"\x00\x00\x01") == 23 and security.leading_zero_bits(b"\x00\x00") == 16
    ch = security.pow_challenge()["challenge"]
    nonce = _solve(ch, 8)
    bad = next(str(i) for i in range(10_000) if security.leading_zero_bits(hashlib.sha256(f"{ch}:{i}".encode()).digest()) < 8)
    assert not security.check_pow(ch, bad)
    assert security.check_pow(ch, nonce)
    assert not security.check_pow(ch, nonce)  # each solution works once
    assert not security.check_pow("1.2", nonce)
    assert not security.check_pow("x.y.z", nonce)
    assert not security.check_pow(ch, "n" * 33)
    old = security.pow_challenge(now=time.time() - 3600)["challenge"]
    assert not security.check_pow(old, _solve(old, 8))  # expired
    exp, rand, _ = ch.split(".")
    assert not security.check_pow(f"{exp}.{rand}.forged", nonce)
    # used challenges are forgotten once they expire
    security._used["stale"] = time.time() - 10
    ch2 = security.pow_challenge()["challenge"]
    assert security.check_pow(ch2, _solve(ch2, 8)) and "stale" not in security._used
    monkeypatch.setattr(config, "POW_BITS", 0)
    assert security.check_pow("anything", "x")


def test_agent_requires_pow_for_new_visitors(monkeypatch, fake):
    monkeypatch.setattr(config, "POW_BITS", 8)
    r = api.post("/api/agent", json={"sessionId": "pow-session-01", "text": "hi"})
    assert r.status_code == 428
    ch = api.get("/api/pow").json()
    assert ch["bits"] == 8
    fake.script = [msg(text("hello"), stop="end_turn")]
    r = api.post("/api/agent", json={"sessionId": "pow-session-01", "text": "hi",
                                    "pow": {"challenge": ch["challenge"], "nonce": _solve(ch["challenge"], 8)}})
    assert r.status_code == 200
    fake.script = [msg(text("again"), stop="end_turn")]
    assert api.post("/api/agent", json={"sessionId": "pow-session-01", "text": "hi"}).status_code == 200  # known session


# ---------------- verify (owner email) ----------------
def test_owner_email_flow(monkeypatch, fake):
    sent = _mail(monkeypatch)
    verify._sent.clear()
    fake.script = [msg(tool("save_draft", **{**DRAFT, "owner_email": "lakshmi@shop.in"})), msg(text("x"), stop="end_turn")]
    ev = run("go")
    assert "confirmation email sent" in steps(ev, "save_draft")[0]["result"]["owner_email"]
    link = sent[-1].get_content().split("\n\n")[1].strip()
    assert sent[-1]["To"] == "lakshmi@shop.in" and "/api/verify-email?" in link
    db.set_live("lakshmi-tiffins")
    # before confirmation, orders go to the platform inbox only
    api.post("/api/orders", json={"slug": "lakshmi-tiffins", "name": "A", "phone": "900000", "items": [{"id": "p1", "qty": 1}]})
    assert sent[-1]["To"] == "ops@b.in"
    assert api.get("/api/verify-email", params={"slug": "lakshmi-tiffins", "email": "lakshmi@shop.in", "t": "bad"}).status_code == 400
    assert api.get("/api/verify-email").status_code == 400
    assert api.get(link.replace(config.public_base(), "")).status_code == 200
    api.post("/api/orders", json={"slug": "lakshmi-tiffins", "name": "A", "phone": "900000", "items": [{"id": "p1", "qty": 1}]})
    assert sent[-1]["To"] == "lakshmi@shop.in"
    # sending again for the same address is skipped; a failed send is reported
    assert "already sent" in asyncio.run(verify.request_owner_email("lakshmi-tiffins", "lakshmi@shop.in"))
    _mail(monkeypatch, ok=False)
    assert "could not send" in asyncio.run(verify.request_owner_email("lakshmi-tiffins", "x@shop.in"))


def test_update_site_owner_email_needs_confirmation(monkeypatch, fake):
    _mail(monkeypatch)
    verify._sent.clear()
    _live_store(owner_email="old@shop.in", owner_email_verified=True)
    db.get_site("shop-one")["owner_email_verified"] = True
    _owned()
    fake.script = [msg(tool("update_site", slug="shop-one", set={"owner_email": "new@shop.in", "tagline": "t"})),
                   msg(text("x"), stop="end_turn")]
    ev = run("change my email")
    res = steps(ev, "update_site")[0]["result"]
    assert "confirmation email sent" in res["owner_email"]
    assert db.get_site("shop-one")["owner_email_verified"] is False
    assert verify.owner_inbox(db.get_site("shop-one")) == "ops@b.in"
    fake.script = [msg(tool("update_site", slug="shop-one", set={"owner_email": "new@shop.in"})), msg(text("x"), stop="end_turn")]
    run("same email again")


# ---------------- agent tools and loop ----------------
def test_daily_budget_and_reserve_for_owners(monkeypatch):
    monkeypatch.setattr(config, "MAX_CLAUDE_CALLS_PER_DAY", 10)
    agent._usage.update(day=None, calls=0, per_ip={})
    agent._count_call("1.1.1.1")
    agent._usage["calls"] = 8  # 80% used
    with pytest.raises(agent.BudgetExceeded, match="new stores"):
        agent._count_call("2.2.2.2")
    agent._count_call("2.2.2.2", owner=True)  # owners may use the reserve
    agent._usage["calls"] = 10
    with pytest.raises(agent.BudgetExceeded, match="Daily AI budget"):
        agent._count_call("3.3.3.3", owner=True)


def test_budget_error_reaches_the_chat(monkeypatch, fake):
    monkeypatch.setattr(config, "MAX_CLAUDE_CALLS_PER_DAY", 0)
    ev = run("hi")
    assert any(e["type"] == "error" and "budget" in e["data"].lower() for e in ev)


def test_clean_products_edge_cases():
    out = agent._clean_products(["not a dict", {"id": "p1", "name": "A", "price": 5, "image_id": "../../etc"}])
    assert len(out) == 1 and "image_id" not in out[0]


def test_tool_edge_cases(fake):
    _live_store()
    _owned()
    fake.script = [msg(tool("save_draft", **{**DRAFT, "slug": "shop-one"}), tool("update_order", ref="NOPE-1", status="paid"),
                       tool("make_coffee"), tool("check_domains", domains=["a.in"])),
                   msg(text("x"), stop="end_turn")]
    ev = run("go")
    assert "already live" in steps(ev, "save_draft")[0]["error"]
    assert "not found" in steps(ev, "update_order")[0]["error"]
    assert "Unknown tool" in steps(ev, "make_coffee")[0]["error"]
    assert steps(ev, "check_domains")[0]["result"]["results"][0]["error"]  # GoDaddy not configured
    ref = db.create_order({"slug": "shop-one", "items": [], "total": 1, "customer": {}})["ref"]
    fake.script = [msg(tool("update_order", ref=ref, status="refunded")), msg(text("x"), stop="end_turn")]
    ev = run("refund it")
    assert "Unknown status" in steps(ev, "update_order")[0]["error"]


def test_list_orders_masks_phone(fake):
    _live_store()
    _owned()
    api.post("/api/orders", json={"slug": "shop-one", "name": "Ravi", "phone": "9000000001", "items": [{"id": "p1", "qty": 1}]})
    fake.script = [msg(tool("list_orders", slug="shop-one")), msg(text("x"), stop="end_turn")]
    ev = run("orders")
    assert steps(ev, "list_orders")[0]["result"]["orders"][0]["customer_text"]["phone"] == "******0001"


def test_image_blocks_skip_bad_ids():
    assert agent._image_blocks(["../secret", "0123456789abcdef"]) == []  # bad id, and a valid id with no file


def test_non_fallback_model_uses_plain_messages_api(monkeypatch, fake):
    monkeypatch.setattr(config, "ANTHROPIC_MODEL", "claude-haiku-5-5")
    fake.script = [msg(text("hi"), stop="end_turn")]
    run("hello")
    assert "betas" not in fake.calls[0] and "fallbacks" not in fake.calls[0]


def test_model_event_tells_the_screen_who_answered(fake):
    fake.script = [msg(text("hi"), stop="end_turn")]
    ev = run("hello")
    assert {"type": "model", "data": {"model": "test", "label": "Free model"}} in ev


def test_session_turn_limit(monkeypatch, fake):
    monkeypatch.setattr(config, "MAX_TURNS_PER_SESSION", 0)
    ev = run("hi")
    assert any("very long" in e["data"] for e in ev if e["type"] == "message")


def test_max_tokens_without_tool_call(fake):
    fake.script = [msg(text("a very long"), stop="max_tokens")]
    ev = run("hi")
    assert any("cut off" in e["data"] for e in ev if e["type"] == "message")


def test_step_limit(fake):
    fake.script = [msg(tool("check_slug", slug=f"shop-{i:02d}")) for i in range(16)]
    ev = run("loop")
    assert any("step limit" in e["data"] for e in ev if e["type"] == "message")


def test_verify_site_with_dns_and_https(monkeypatch):
    monkeypatch.setattr(config, "ROOT_DOMAIN", "vaani.in")
    monkeypatch.setattr(config, "SERVER_IP", "1.2.3.4")
    monkeypatch.setattr(agent, "_http_transport", httpx.MockTransport(lambda r: httpx.Response(200)))

    async def ok_dns(host, port):
        return [(0, 0, 0, "", ("1.2.3.4", 443))]

    async def no_dns(host, port):
        raise OSError("no such host")

    loop = asyncio.new_event_loop()
    monkeypatch.setattr(loop, "getaddrinfo", ok_dns)
    res = loop.run_until_complete(agent._verify("shop"))
    assert res["dns_resolves"] and res["points_to_server"] and res["ok"] and res["https"]
    monkeypatch.setattr(config, "SERVER_IP", "")
    monkeypatch.setattr(loop, "getaddrinfo", no_dns)
    res = loop.run_until_complete(agent._verify("shop"))
    assert res["dns_resolves"] is False and "no such host" in res["dns_error"]
    loop.close()


def test_verify_site_http_failure(monkeypatch):
    def boom(request):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(agent, "_http_transport", httpx.MockTransport(boom))
    res = asyncio.run(agent._verify("shop"))
    assert res["ok"] is False and "propagating" in res["note"]


# ---------------- free model translation ----------------
def test_to_openai_edge_cases():
    out = free_llm.to_openai(
        [{"type": "text", "text": "sys"}],
        [{"role": "user", "content": "plain string"},
         {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": [{"type": "text", "text": "a"}, {"type": "image"}]},
                                      {"type": "image", "source": {"type": "url", "url": "x"}}]},
         {"role": "assistant", "content": [{"type": "text", "text": "just text"}]}])
    assert out[1] == {"role": "user", "content": [{"type": "text", "text": "plain string"}]}
    assert out[2] == {"role": "tool", "tool_call_id": "t1", "content": "a"}
    assert out[3] == {"role": "assistant", "content": "just text"}


def test_from_openai_empty_reply_and_length():
    m = free_llm.from_openai({"choices": [{"message": {"content": "  "}, "finish_reason": "length"}]})
    assert m.content[0].text == "(no reply from the backup model)" and m.stop_reason == "max_tokens"
    m = free_llm.from_openai({"choices": [{"message": {"tool_calls": [{"function": {"name": "x", "arguments": "[1]"}}]}}]})
    assert m.content[0].input == {}


def test_free_model_not_configured(monkeypatch):
    monkeypatch.setattr(config, "FREE_LLM_BASE_URL", "")
    with pytest.raises(RuntimeError, match="not configured"):
        asyncio.run(free_llm.create([], [], []))


def test_free_model_non_json_error_body(monkeypatch):
    monkeypatch.setattr(config, "FREE_LLM_BASE_URL", "http://free.test/v1")
    monkeypatch.setattr(config, "FREE_LLM_MODEL", "m")
    monkeypatch.setattr(config, "FREE_LLM_API_KEY", "")
    monkeypatch.setattr(config, "FREE_LLM_FALLBACK_MODELS", [])
    seen = []

    def handler(request):
        seen.append(request.headers.get("authorization"))
        return httpx.Response(502, text="<html>bad gateway</html>")
    monkeypatch.setattr(free_llm, "_transport", httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match="All free models failed"):
        asyncio.run(free_llm.create([], [], []))
    assert seen == [None]  # no key, no Authorization header


# ---------------- GoDaddy ----------------
@pytest.fixture
def gd(monkeypatch):
    monkeypatch.setattr(config, "GODADDY_API_KEY", "k")
    monkeypatch.setattr(config, "GODADDY_API_SECRET", "s")
    calls = []

    def use(handler):
        def wrapped(request):
            calls.append(request)
            return handler(request)
        monkeypatch.setattr(godaddy, "_transport", httpx.MockTransport(wrapped))
    return use, calls


def test_godaddy_domains(gd):
    use, calls = gd

    def handler(request):
        if request.url.path == "/v1/domains/suggest":
            return httpx.Response(200, json=[{"domain": "a.in"}, {"domain": "b.in"}])
        if request.url.params["domain"] == "bad.in":
            return httpx.Response(422, json={"message": "invalid domain"})
        if request.url.params["domain"] == "html.in":
            return httpx.Response(500, text="oops")
        return httpx.Response(200, json={"available": True, "price": 11990000, "currency": "USD"})
    use(handler)
    assert asyncio.run(godaddy.suggest_domains("lakshmi", 50)) == ["a.in", "b.in"]
    assert calls[0].url.params["limit"] == "15" and calls[0].headers["authorization"] == "sso-key k:s"
    res = asyncio.run(godaddy.check_domains(["A.in ", "a.in", "bad.in", "html.in"]))
    assert res[0] == {"domain": "a.in", "available": True, "price": 11.99, "currency": "USD"}
    assert len(res) == 3 and "invalid domain" in res[1]["error"] and "oops" in res[2]["error"]


def test_godaddy_dns_record(gd, monkeypatch):
    use, calls = gd
    use(lambda r: httpx.Response(200))
    with pytest.raises(godaddy.GoDaddyError, match="not configured"):
        asyncio.run(godaddy.create_subdomain("shop"))
    monkeypatch.setattr(config, "ROOT_DOMAIN", "vaani.in")
    monkeypatch.setattr(config, "SERVER_IP", "1.2.3.4")
    out = asyncio.run(godaddy.create_subdomain("shop"))
    assert out == {"record": "shop.vaani.in", "type": "A", "points_to": "1.2.3.4"}
    assert calls[-1].method == "PUT" and json.loads(calls[-1].content) == [{"data": "1.2.3.4", "ttl": 600}]


def test_godaddy_price_missing_and_empty_suggestions(gd):
    use, _ = gd
    use(lambda r: httpx.Response(200, json={"available": False}) if "available" in r.url.path else httpx.Response(204))
    assert asyncio.run(godaddy.check_domains(["x.in"]))[0]["price"] is None
    assert asyncio.run(godaddy.suggest_domains("x")) == []


def test_publish_creates_dns_record(gd, monkeypatch, fake):
    use, calls = gd
    use(lambda r: httpx.Response(200))
    monkeypatch.setattr(config, "ROOT_DOMAIN", "vaani.in")
    monkeypatch.setattr(config, "SERVER_IP", "1.2.3.4")
    fake.script = [msg(tool("save_draft", **DRAFT)), msg(text("x"), stop="end_turn")]
    run("go")
    api.post("/api/approve", json={"sessionId": SID, "slug": "lakshmi-tiffins"})
    fake.script = [msg(tool("publish_site", slug="lakshmi-tiffins")), msg(text("x"), stop="end_turn")]
    ev = run("publish")
    assert steps(ev, "publish_site")[0]["result"]["dns"]["record"] == "lakshmi-tiffins.vaani.in"


# ---------------- notify ----------------
def test_send_mail_recipient_fallbacks_and_failure(monkeypatch):
    sent = _mail(monkeypatch)
    assert asyncio.run(notify.send_mail("not an email", "S", "b", bcc="boss@b.in")) is True
    assert sent[-1]["To"] == "ops@b.in" and sent[-1]["Bcc"] is None
    assert asyncio.run(notify.send_mail("owner@b.in", "S", "b", bcc="boss@b.in")) is True
    assert sent[-1]["Bcc"] == "boss@b.in"
    monkeypatch.setattr(config, "MAIL_TO", "")
    assert asyncio.run(notify.send_mail("nope", "S", "b")) is False
    _mail(monkeypatch, ok=False)
    assert asyncio.run(notify.send_mail("owner@b.in", "S", "b")) is False


# ---------------- storefront ----------------
def test_storefront_services_prices_and_phone_formats():
    html = site_render.render_site({
        "business_name": "Tuition", "contact": {"whatsapp": "+91 98765 43210", "phone": "040-1234"},
        "products": [{"id": "p1", "name": "Bad price", "price": "abc"}, {"id": "p2", "name": "Half", "price": 10.5}],
        "content": [{"lang_code": "en", "lang_label": "English", "hero_title": "T", "hero_subtitle": "s", "about": "a",
                     "services": [{"name": "Maths", "description": "Class 10", "price": "₹500/month"}, {"name": "Free demo"}]}],
    })
    assert "Maths" in html and "₹500/month" in html and "Free demo" in html
    assert "₹10.50" in html and "wa.me/919876543210" in html


# ---------------- HTTP endpoints ----------------
def test_media_served_and_missing():
    iid = upload()
    r = api.get(f"/media/{iid}.jpg")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert api.get("/media/0123456789abcdef.jpg").status_code == 404


def test_store_pages_get_a_strict_policy():
    _live_store()
    csp = api.get("/s/shop-one").headers["content-security-policy"]
    assert f"'sha256-{site_render.JS_HASH}'" in csp and "unsafe-inline" not in csp.split("script-src")[1].split(";")[0]
    app_csp = api.get("/healthz").headers["content-security-policy"]
    assert "script-src 'self'" in app_csp
    assert api.get("/s/missing").status_code == 404


def test_www_redirect_and_store_subdomain(monkeypatch):
    monkeypatch.setattr(main, "ROOT", "vaani.in")
    r = api.get("/about", headers={"host": "www.vaani.in"}, follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "https://vaani.in/about"


def test_upload_needs_jpeg_data_url():
    assert api.post("/api/upload", json={"dataUrl": "data:image/png;base64,AAAA"}).status_code == 400


def test_post_without_content_length_is_refused():
    def body():
        yield b'{"slug": "x"}'
    r = api.post("/api/orders", content=body(), headers={"content-type": "application/json"})
    assert r.status_code == 411


def test_rate_limit_forgets_idle_keys():
    main._hits.clear()
    for i in range(20_001):
        main._hits[f"k{i}"] = [time.time() - 7200]
    main._rate_limit("fresh", 5, 60)
    assert len(main._hits) == 1


def test_old_sessions_are_evicted(fake):
    for i in range(5000):
        s = main.Session()
        s.last_used = i
        main.sessions[f"sess-{i:06d}"] = s
    fake.script = [msg(text("hi"), stop="end_turn")]
    run("hi", sid="brand-new-session")
    assert len(main.sessions) == 4501 and "sess-000000" not in main.sessions


def test_claude_busy_message(fake):
    fake.script = [anthropic.RateLimitError("slow down", response=httpx.Response(429, request=_req()), body=None)]
    ev = run("hi")
    assert any(e["type"] == "error" and "busy" in e["data"] for e in ev)


def test_approve_refused_while_agent_works(fake):
    fake.script = [msg(tool("save_draft", **DRAFT)), msg(text("x"), stop="end_turn")]
    run("go")
    main.sessions[SID].busy = True
    assert api.post("/api/approve", json={"sessionId": SID, "slug": "lakshmi-tiffins"}).status_code == 409


def test_contact_without_mail_and_with_failing_mail(monkeypatch):
    assert api.post("/api/contact", json={"name": "A", "email": "a@b.in", "message": "hi"}).status_code == 503
    _mail(monkeypatch, ok=False)
    assert api.post("/api/contact", json={"name": "A", "email": "a@b.in", "message": "hi"}).status_code == 500
    sent = _mail(monkeypatch)
    assert api.post("/api/contact", json={"name": "A", "email": "a@b.in", "message": "hi"}).status_code == 200
    assert sent[-1]["To"] == "ops@b.in"


def test_rotate_manage_key():
    site = _live_store()
    old = site["edit_key"]
    assert api.post("/api/manage/rotate", json={"slug": "shop-one", "key": "wrong"}).status_code == 403
    new = api.post("/api/manage/rotate", json={"slug": "shop-one", "key": old}).json()["key"]
    assert new != old
    assert api.post("/api/manage", json={"slug": "shop-one", "key": old}).status_code == 403
    d = api.post("/api/manage", json={"slug": "shop-one", "key": new}).json()
    assert security.check_preview_token("shop-one", d["preview_token"]) and d["owner_email_verified"] is False


def test_redact_filter_leaves_non_tuple_args():
    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "plain message", None, None)
    assert main._RedactKeys().filter(rec) and rec.getMessage() == "plain message"


def test_mount_frontend_only_when_built(tmp_path):
    assert main.mount_frontend(str(tmp_path / "missing")) is False


def test_housekeeping_runs_at_startup_and_survives_errors(monkeypatch):
    runs = []

    def flaky():
        runs.append(1)
        if len(runs) == 1:
            raise OSError("disk hiccup")
        return {}
    monkeypatch.setattr(main.db, "housekeeping", flaky)
    monkeypatch.setattr(main, "HOUSEKEEPING_EVERY", 0)
    with TestClient(main.app) as client:
        deadline = time.time() + 2
        while len(runs) < 2 and time.time() < deadline:
            client.get("/healthz")
    assert len(runs) >= 2  # the first failure was logged, and the loop kept going


def test_media_rejects_malformed_names():
    assert api.get("/media/not-a-photo.png").status_code == 404


def test_update_site_cannot_touch_protected_fields(fake):
    site = _live_store()
    _owned()
    key = site["edit_key"]
    fake.script = [msg(tool("update_site", slug="shop-one", set={"edit_key": "attacker", "status": "draft", "tagline": "ok"})),
                   msg(text("x"), stop="end_turn")]
    run("update")
    s = db.get_site("shop-one")
    assert s["edit_key"] == key and s["status"] == "live" and s["tagline"] == "ok"


# ---------------- Malformed model output (found in live testing with a free model) ----------------
def test_save_draft_decodes_json_strings_and_drops_bad_shapes(fake):
    content = [{"lang_code": "te", "lang_label": "తెలుగు", "hero_title": "లక్ష్మి", "hero_subtitle": "s", "about": "a"}, "stray"]
    draft = {**DRAFT, "content": json.dumps(content), "products": "not json", "contact": "{bad", "theme": ["x"],
             "upi": json.dumps({"vpa": "lakshmi@okaxis"})}
    fake.script = [msg(tool("save_draft", **draft)), msg(text("x"), stop="end_turn")]
    ev = run("go")
    assert steps(ev, "save_draft")[0]["status"] == "done"
    s = db.get_site("lakshmi-tiffins")
    assert s["content"] == content[:1] and s["products"] == [] and s["contact"] == {} and s["theme"] == {}
    assert s["upi"] == {"vpa": "lakshmi@okaxis"}
    saved = steps(ev, "save_draft")[0]["result"]
    assert api.get("/s/lakshmi-tiffins", params={"t": saved["_preview"]}).status_code == 200


def test_update_site_normalizes_set_fields(fake):
    _live_store()
    _owned()
    fake.script = [msg(tool("update_site", slug="shop-one", set={"contact": json.dumps({"city": "Guntur"})})),
                   msg(text("x"), stop="end_turn")]
    run("move")
    assert db.get_site("shop-one")["contact"] == {"city": "Guntur"}


def test_pages_survive_malformed_data_already_saved():
    site = _live_store()
    for k, v in {"content": "a string", "products": "x", "theme": "red", "upi": "u", "contact": ["c"]}.items():
        site[k] = v
    site["content"] = [{"lang_code": "en", "lang_label": "English", "hero_title": "Hi", "hero_subtitle": "s", "about": "a",
                        "services": ["bad", {"name": "Good service"}], "faqs": "nope"}, "junk"]
    assert api.get("/s/shop-one").status_code == 200
    assert "Good service" in api.get("/s/shop-one").text
    cards = api.get("/api/sites").json()
    assert cards[0]["languages"] == ["English"] and cards[0]["city"] is None
    site["content"] = "a string"
    assert api.get("/s/shop-one").status_code == 200  # falls back to the business name
    o = api.post("/api/orders", json={"slug": "shop-one", "name": "A", "phone": "900000", "items": [{"id": "p1", "qty": 1}]})
    assert o.status_code == 400  # products unreadable: nothing orderable, but no crash


def test_approve_after_restart_with_private_key(fake):
    fake.script = [msg(tool("save_draft", **DRAFT)), msg(text("x"), stop="end_turn")]
    ev = run("go")
    key = steps(ev, "save_draft")[0]["result"]["_manage"]["key"]
    main.sessions.clear()  # the server restarted: in-memory sessions are gone
    body = {"sessionId": "fresh-session-1", "slug": "lakshmi-tiffins"}
    assert api.post("/api/approve", json=body).status_code == 403
    assert api.post("/api/approve", json={**body, "key": "wrong"}).status_code == 403
    assert api.post("/api/approve", json={**body, "key": key}).status_code == 200
    assert api.post("/api/approve", json={"sessionId": "fresh-session-2", "slug": "missing", "key": key}).status_code == 403


def test_store_is_introduced_to_the_model_even_after_key_approval(fake):
    fake.script = [msg(tool("save_draft", **DRAFT)), msg(text("x"), stop="end_turn")]
    ev = run("go")
    key = steps(ev, "save_draft")[0]["result"]["_manage"]["key"]
    main.sessions.clear()  # restart
    api.post("/api/approve", json={"sessionId": "after-restart-1", "slug": "lakshmi-tiffins", "key": key})
    fake.script = [msg(text("publishing"), stop="end_turn")]
    run("I approve the preview", sid="after-restart-1", manageSlug="lakshmi-tiffins", manageKey=key)
    first_user_text = fake.calls[-1]["messages"][0]["content"][-1]["text"]
    assert first_user_text.startswith("[Owner is managing their existing store: slug=lakshmi-tiffins, status=draft]")
    fake.script = [msg(text("again"), stop="end_turn")]
    run("thanks", sid="after-restart-1", manageSlug="lakshmi-tiffins", manageKey=key)
    assert not fake.calls[-1]["messages"][-1]["content"][-1]["text"].startswith("[Owner")  # only once


def test_store_pages_answer_head_requests():
    _live_store()
    r = api.head("/s/shop-one")
    assert r.status_code == 200 and "sha256-" in r.headers["content-security-policy"]


# ---------------- SQLite store ----------------
def test_writes_survive_a_restart(tmp_path):
    site = _live_store()
    ref = db.create_order({"slug": "shop-one", "items": [], "total": 5, "customer": {"name": "A", "phone": "1", "note": ""}})["ref"]
    db.set_order_status(ref, "paid")
    sites, orders = db._read_all(db._connect(db.DB_PATH))  # a fresh connection, as after a restart
    assert sites["shop-one"]["edit_key"] == site["edit_key"]
    assert orders[ref]["status"] == "paid" and orders[ref]["total"] == 5


def test_legacy_json_is_imported_once(tmp_path):
    (tmp_path / "sites.json").write_text(json.dumps({"old-shop": {"slug": "old-shop", "status": "live"}}))
    (tmp_path / "orders.json").write_text(json.dumps(
        {"OS-1": {"ref": "OS-1", "slug": "old-shop", "createdAt": "2026-01-01T00:00:00+00:00", "total": 9}}))
    conn = db._connect(str(tmp_path / "store.db"))
    assert db._import_legacy(conn, str(tmp_path)) == 2
    sites, orders = db._read_all(conn)
    assert sites["old-shop"]["status"] == "live" and orders["OS-1"]["total"] == 9
    assert (tmp_path / "sites.json.migrated").exists() and not (tmp_path / "sites.json").exists()
    assert db._import_legacy(conn, str(tmp_path)) == 0  # already imported
    empty = tmp_path / "empty"
    empty.mkdir()
    assert db._import_legacy(db._connect(str(empty / "s.db")), str(empty)) == 0  # nothing to import
    only_sites = tmp_path / "only-sites"
    only_sites.mkdir()
    (only_sites / "sites.json").write_text(json.dumps({"a": {"slug": "a"}}))
    assert db._import_legacy(db._connect(str(only_sites / "s.db")), str(only_sites)) == 1


def test_ping_and_backup(tmp_path):
    _live_store()
    assert db.ping() is True
    dest = db.backup(str(tmp_path / "backup.db"))
    sites, _ = db._read_all(db._connect(dest))
    assert "shop-one" in sites


# ---------------- Production readiness ----------------
def _prod_ready(monkeypatch):
    for k, v in {"ROOT_DOMAIN": "vaani.in", "SERVER_IP": "1.2.3.4", "SMTP_USER": "o@vaani.in", "SMTP_PASS": "x",
                 "MAIL_TO": "o@vaani.in", "LLM_PROVIDER": "claude", "LLM_FALLBACK": "none", "POW_BITS": 16,
                 "FREE_LLM_BASE_URL": "", "FREE_LLM_MODEL": ""}.items():
        monkeypatch.setattr(config, k, v)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-x")
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)


def test_config_problems(monkeypatch):
    _prod_ready(monkeypatch)
    assert config.problems() == []
    monkeypatch.setattr(config, "ROOT_DOMAIN", "")
    monkeypatch.setattr(config, "SMTP_PASS", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(config, "LLM_FALLBACK", "free")
    monkeypatch.setattr(config, "POW_BITS", 0)
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://vaani.in")
    found = " | ".join(config.problems())
    for words in ("ROOT_DOMAIN", "SMTP_USER", "ANTHROPIC_API_KEY", "LLM_FALLBACK=free", "POW_BITS", "https://"):
        assert words in found
    monkeypatch.setattr(config, "LLM_PROVIDER", "free")
    assert any("free model" in p and "LLM_PROVIDER" in p for p in config.problems())


def test_production_refuses_to_start_with_problems(monkeypatch):
    _prod_ready(monkeypatch)
    monkeypatch.setattr(config, "APP_ENV", "production")
    assert main.check_config() == []
    monkeypatch.setattr(config, "SERVER_IP", "")
    with pytest.raises(RuntimeError, match="Refusing to start"):
        main.check_config()
    monkeypatch.setattr(config, "APP_ENV", "development")
    assert main.check_config()  # development only warns


def test_readiness(monkeypatch):
    assert api.get("/readyz").json() == {"ok": True, "database": True, "disk": True}

    def broken():
        raise OSError("disk full")
    monkeypatch.setattr(main.db, "ping", broken)
    r = api.get("/readyz")
    assert r.status_code == 503 and r.json()["database"] is False
    monkeypatch.setattr(main.db, "ping", lambda: True)
    monkeypatch.setattr(main, "MIN_FREE_DISK", 10**18)
    assert api.get("/readyz").json()["disk"] is False


def test_request_ids():
    r = api.get("/healthz", headers={"x-request-id": "abc12345-req"})
    assert r.headers["x-request-id"] == "abc12345-req"
    generated = api.get("/healthz", headers={"x-request-id": "bad id with spaces"}).headers["x-request-id"]
    assert len(generated) == 32 and " " not in generated


def test_json_logs_carry_request_id_and_errors(capsys):
    from app import observability
    observability.setup(json_logs=True)
    token = observability.request_id.set("req-12345678")
    try:
        logging.getLogger("vaanilaunch").info("hello")
        try:
            raise ValueError("boom")
        except ValueError:
            logging.getLogger("vaanilaunch").exception("failed")
    finally:
        observability.request_id.reset(token)
    lines = [json.loads(line) for line in capsys.readouterr().err.strip().splitlines()]
    assert lines[0]["request_id"] == "req-12345678" and lines[0]["message"] == "hello"
    assert "ValueError: boom" in lines[1]["error"]
    observability.setup(json_logs=False)
