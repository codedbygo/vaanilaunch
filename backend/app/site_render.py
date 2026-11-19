"""Renders a generated storefront: bilingual, mobile-first, with catalogue, cart and UPI checkout."""
import base64
import hashlib
import json
import re
from html import escape


def _e(s) -> str:
    return escape(str(s if s is not None else ""), quote=True)


def _color(c, default: str = "#e8590c") -> str:
    return c if isinstance(c, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", c) else default


# Each business category gets its own default look; the owner can change it by voice
# ("make it look premium"). Styles change type, layout and shape, not just the colour.
STYLES = ("classic", "modern", "premium", "playful")
_CATEGORY_STYLE = {"restaurant": "classic", "home_food": "classic", "boutique": "premium", "salon": "premium",
                   "coaching": "modern", "clinic": "modern", "services": "modern", "retail": "playful"}
_SCHEMA_TYPE = {"restaurant": "Restaurant", "home_food": "FoodEstablishment", "boutique": "ClothingStore",
                "salon": "BeautySalon", "coaching": "EducationalOrganization", "clinic": "MedicalClinic",
                "services": "LocalBusiness", "retail": "Store"}


def style_of(site: dict) -> str:
    chosen = as_dict(site.get("theme")).get("style")
    return chosen if chosen in STYLES else _CATEGORY_STYLE.get(str(site.get("category")), "classic")


def _social(v, base: str) -> str:
    """A full http(s) link, or a bare handle turned into one; anything else is dropped."""
    v = str(v or "").strip()
    if re.fullmatch(r"https?://[^\s\"'<>]{3,200}", v):
        return v
    handle = v.lstrip("@")
    return f"{base}{handle}" if re.fullmatch(r"[A-Za-z0-9._]{1,40}", handle) else ""


def _price(v) -> str:
    try:
        v = float(v)
        return f"₹{v:,.0f}" if v == int(v) else f"₹{v:,.2f}"
    except (TypeError, ValueError):
        return ""


# A product without a photo shows an icon instead of a big letter: the one the agent chose, or
# one matched from the product's name. First match wins, so specific words come before general.
_ICONS = (
    (("dosa", "pesarattu", "uttapam", "crepe", "pancake"), "🥞"), (("idli", "idly"), "🍚"),
    (("biryani", "pulao"), "🍛"), (("pongal", "upma", "khichdi", "porridge", "kheer"), "🍲"),
    (("poori", "puri", "roti", "chapati", "paratha", "naan", "bread"), "🫓"),
    (("meals", "thali", "box", "combo", "tiffin"), "🍱"), (("samosa", "momo", "dumpling"), "🥟"),
    (("vada", "bajji", "pakoda", "snack", "chips", "murukku"), "🥨"), (("pickle", "achar", "chutney"), "🫙"),
    (("batter", "flour", "masala", "spice", "powder"), "🥣"), (("curry", "dal", "sambar", "gravy"), "🍛"),
    (("rice",), "🍚"), (("tea", "chai", "coffee"), "☕"), (("juice", "lassi", "shake", "drink"), "🧃"),
    (("cake", "pastry", "brownie"), "🎂"), (("cookie", "biscuit"), "🍪"),
    (("laddu", "sweet", "halwa", "jalebi", "barfi", "mithai"), "🍬"), (("ice cream", "kulfi"), "🍨"),
    (("saree", "sari", "lehenga", "dress", "gown"), "👗"), (("blouse", "kurti", "kurta", "shirt", "top"), "👚"),
    (("stitching", "tailoring", "alteration"), "🧵"), (("jewel", "necklace", "bangle", "earring"), "💍"),
    (("makeup", "bridal", "facial", "beauty"), "💄"), (("mehendi", "mehndi", "henna"), "🌿"),
    (("hair", "haircut", "salon", "spa"), "✂️"), (("tuition", "class", "coaching", "course", "lesson"), "📚"),
    (("room", "bed", "pg", "hostel", "stay"), "🛏️"), (("clean", "laundry", "wash", "iron"), "🧺"),
    (("flower", "bouquet", "garland"), "💐"), (("candle", "diya", "decor"), "🕯️"), (("plant",), "🪴"),
)


def _is_icon(v) -> bool:
    """One emoji (with its joiners and variation marks), never letters or markup."""
    v = str(v or "")
    if not 0 < len(v) <= 8 or any(ch.isalnum() or ch.isspace() or not (ord(ch) >= 0x2190 or ch in "\u200d\ufe0f")
                                  for ch in v):
        return False
    # Exactly one picture: joined sequences (👩‍🍳) and skin tones count as one, a row of 🍕🍕 does not.
    pictures = [ch for ch in v if ch not in "\u200d\ufe0f" and not 0x1F3FB <= ord(ch) <= 0x1F3FF]
    return len(pictures) - v.count("\u200d") == 1


def product_icon(p: dict) -> str:
    if _is_icon(p.get("icon")):
        return str(p["icon"])
    found = re.findall(r"[a-z]+", str(p.get("name") or "").lower())
    words, text = set(found), " ".join(found)
    for keys, icon in _ICONS:
        if any(k in words or (" " in k and k in text) for k in keys):
            return icon
    return "🛍️"


def _product_card(p: dict, english: bool) -> str:
    primary = p.get("name") if english else (p.get("name_local") or p.get("name"))
    secondary = p.get("name_local") if english else p.get("name")
    desc = p.get("description") if english else (p.get("description_local") or p.get("description"))
    img = (f'<img src="/media/{_e(p["image_id"])}.jpg" alt="{_e(p.get("name"))}" loading="lazy">'
           if p.get("image_id") else f'<div class="ph" aria-hidden="true">{_e(product_icon(p))}</div>')
    unit = f' <small>/ {_e(p["unit"])}</small>' if p.get("unit") else ""
    sold_out = p.get("available") is False
    action = ('<span class="soldout">Sold out</span>' if sold_out else
              f'<div class="qty" data-id="{_e(p["id"])}"><button class="minus" aria-label="less">−</button>'
              f'<span class="n">0</span><button class="plus" aria-label="more">+</button></div>')
    return (f'<article class="prod">{img}<div class="pb"><h3>{_e(primary)}</h3>'
            f'{f"<div class=sec>{_e(secondary)}</div>" if secondary and secondary != primary else ""}'
            f'<p>{_e(desc)}</p><div class="row"><strong>{_price(p.get("price"))}{unit}</strong>{action}</div></div></article>')


def service_names(site: dict) -> list[str]:
    """Service names from the English block (else the first): pictures are keyed by these, so every
    language version of a service shows the same picture."""
    langs = [b for b in as_list(site.get("content")) if isinstance(b, dict)]
    ref = next((b for b in langs if str(b.get("lang_code", "")).lower().startswith("en")), langs[0] if langs else {})
    return [str(s.get("name") or "").strip() for s in as_list(ref.get("services")) if isinstance(s, dict)]


def service_key(name: str) -> str:
    return " ".join(name.lower().split())


def _lang_block(l: dict, i: int, products: list, facts: str = "", svc: tuple = ((), {})) -> str:
    english = str(l.get("lang_code", "")).lower().startswith("en")
    prods = "".join(_product_card(p, english) for p in products)
    names, pics = svc

    def service(n: int, s: dict) -> str:
        price = f"<strong>{_e(s.get('price'))}</strong>" if s.get("price") else ""
        ref = names[n] if n < len(names) else str(s.get("name") or "")
        pic = pics.get(service_key(ref)) if isinstance(pics, dict) else None
        top = (f'<img src="/media/{_e(pic)}.jpg" alt="{_e(s.get("name"))}" loading="lazy">'
               if isinstance(pic, str) and re.fullmatch(r"[a-f0-9]{16}", pic)
               else f'<div class="ph" aria-hidden="true">{_e(product_icon({"name": ref}))}</div>')
        return f"<div class='card svc'>{top}<h3>{_e(s.get('name'))}</h3><p>{_e(s.get('description'))}</p>{price}</div>"

    services = "".join(service(n, s) for n, s in enumerate(x for x in as_list(l.get("services")) if isinstance(x, dict)))
    faqs = "".join(f"<details><summary>{_e(f.get('q'))}</summary><p>{_e(f.get('a'))}</p></details>"
                   for f in as_list(l.get("faqs")) if isinstance(f, dict))
    quotes = "".join(f"<figure class=card><blockquote>“{_e(t.get('text'))}”</blockquote><figcaption>{_e(t.get('name'))}</figcaption></figure>"
                     for t in as_list(l.get("testimonials")) if isinstance(t, dict) and t.get("text"))
    cta = f'<a class="btn" href="#menu-{i}">{_e(l.get("cta") or "Order now")}</a>' if products else ""
    return f"""
<div class="lang" data-lang="{_e(l.get('lang_code'))}" {'hidden' if i else ''}>
  <header class="hero"><h1>{_e(l.get('hero_title'))}</h1><p>{_e(l.get('hero_subtitle'))}</p>{cta}</header>
  {facts}
  {f'<section id="menu-{i}"><h2>{_e(l.get("products_heading") or "Our products")}</h2><div class="prods">{prods}</div></section>' if prods else ''}
  {f'<section><h2>{_e(l.get("services_heading") or "Services")}</h2><div class="grid">{services}</div></section>' if services else ''}
  <section><h2>{_e(l.get('about_heading') or 'About')}</h2><p>{_e(l.get('about'))}</p></section>
  {f'<section><h2>{_e(l.get("testimonials_heading") or "What customers say")}</h2><div class="grid">{quotes}</div></section>' if quotes else ''}
  {f'<section><h2>{_e(l.get("faq_heading") or "FAQ")}</h2>{faqs}</section>' if faqs else ''}
</div>"""


CSS = """
*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Noto Sans','Noto Sans Telugu','Noto Sans Devanagari',sans-serif;color:#222;background:var(--bg);line-height:1.55;padding-bottom:80px}
.notice{background:#222;color:#fff;text-align:center;padding:8px 12px;font-size:.92rem}
.preview{background:#fff3bf;color:#5c4400;text-align:center;padding:8px;font-size:.9rem;font-weight:600}
nav{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 16px;background:#fff;box-shadow:0 1px 4px #0001;position:sticky;top:0;z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--p);font-size:1.1rem}
.logo{width:36px;height:36px;border-radius:50%;background:var(--p);color:#fff;display:grid;place-items:center;font-size:1.1rem}
nav .langs button{border:1px solid var(--p);background:#fff;color:var(--p);border-radius:20px;padding:4px 12px;margin-left:4px;cursor:pointer;font:inherit;font-size:.85rem}
nav .langs button.on{background:var(--p);color:#fff}
.hero{padding:64px 18px 56px;text-align:center;background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 55%,#000));color:#fff}
.hero h1{font-size:clamp(2rem,7vw,3.2rem);margin:0 0 8px;letter-spacing:-.01em;text-shadow:0 2px 12px #0004}.hero p{margin:0;opacity:.95}
.btn{display:inline-block;margin-top:18px;background:#fff;color:var(--p);padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:700}
section{max-width:1000px;margin:auto;padding:28px 16px}h2{color:var(--p);margin-top:0}
.prods{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}@media(min-width:700px){.prods{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}}
.prod{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px #0000000f;display:flex;flex-direction:column}
.prod img,.prod .ph{width:100%;aspect-ratio:1/1;object-fit:cover;background:color-mix(in srgb,var(--p) 15%,#fff)}
.svc img,.svc .ph{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;margin-bottom:10px;display:block}
.svc .ph{display:grid;place-items:center;font-size:3.2rem;line-height:1;background:radial-gradient(circle at 50% 40%,#fff,color-mix(in srgb,var(--p) 14%,#fff))}
.prod .ph{display:grid;place-items:center;font-size:4rem;line-height:1;background:radial-gradient(circle at 50% 40%,#fff,color-mix(in srgb,var(--p) 14%,#fff))}
.pb{padding:12px 14px;display:flex;flex-direction:column;flex:1}.pb h3{margin:0;font-size:1.05rem}.sec{color:#777;font-size:.85rem}
.pb p{color:#555;font-size:.9rem;margin:6px 0 10px;flex:1}.row{display:flex;justify-content:space-between;align-items:center;gap:6px}.row strong small{display:block;font-weight:500;color:#777;font-size:.75rem}
.qty{display:flex;align-items:center;gap:8px}.qty button{width:32px;height:32px;border-radius:50%;border:0;background:var(--p);color:#fff;font-size:1.1rem;cursor:pointer}
.qty .minus{background:#eee;color:#333}.soldout{color:#b00;font-size:.85rem;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 8px #0001}
details{background:#fff;border-radius:8px;padding:12px;margin:8px 0}
form{display:grid;gap:10px;max-width:480px}input,textarea{padding:10px;border:1px solid #ccc;border-radius:8px;font:inherit;width:100%}
.pbtn{background:var(--p);color:#fff;border:0;padding:12px;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}
.cartbar{position:fixed;left:12px;right:12px;bottom:12px;max-width:640px;margin:auto;background:var(--p);color:#fff;border-radius:14px;padding:12px 16px;display:none;justify-content:space-between;align-items:center;box-shadow:0 6px 20px #0003;z-index:10}
.cartbar button{background:#fff;color:var(--p);border:0;border-radius:10px;padding:8px 16px;font:inherit;font-weight:700;cursor:pointer}
.wa{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#25d366;color:#fff;text-decoration:none;margin-left:6px;font-size:17px;vertical-align:middle}
.facts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:14px 12px 0;max-width:1000px;margin:auto}.facts span{background:#fff;border-radius:999px;padding:6px 12px;font-size:.82rem;box-shadow:0 1px 6px #0000000f}
.bn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}@media(max-width:420px){.bn{max-width:28vw}nav{padding:10px 12px}nav .langs button{padding:4px 9px;font-size:.78rem;margin-left:3px}.wa{width:30px;height:30px;font-size:15px;margin-left:4px}}.langs{display:flex;align-items:center;flex-wrap:nowrap}
dialog{border:0;border-radius:16px;padding:20px;width:min(440px,92vw);max-height:90vh}dialog::backdrop{background:#0007}
.lines{margin:0 0 12px;padding:0;list-style:none}.lines li{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #eee}
.total{font-weight:700;font-size:1.1rem;text-align:right;margin-bottom:12px}
.qr{width:220px;margin:8px auto;display:block}.qr svg{width:100%;height:auto}
.paid-note{background:#fff8e1;border-radius:8px;padding:8px;font-size:.85rem;margin-top:10px}
.x{float:right;background:none;border:0;font-size:1.4rem;cursor:pointer}
.privacy{color:#777;font-size:.78rem}
.oerr{color:#b00020;background:#fdecee;border-radius:8px;padding:8px 10px;margin:0;font-size:.9rem}
footer{text-align:center;padding:24px;color:#777;font-size:.85rem}
blockquote{margin:0 0 8px;font-size:1rem}figcaption{color:#666;font-size:.88rem}figure{margin:0}.social a{margin-right:12px}
.st-modern .hero{text-align:left;padding:80px max(20px,calc(50% - 480px)) 64px}.st-modern .prod,.st-modern .card,.st-modern details{border-radius:6px}
.st-modern h2{letter-spacing:-.02em;font-size:1.6rem}.st-modern .btn{border-radius:8px}
.st-premium{--serif:Georgia,'Noto Serif','Noto Serif Telugu','Noto Serif Devanagari',serif}.st-premium h1,.st-premium h2,.st-premium .brand{font-family:var(--serif);font-weight:600}
.st-premium .hero{background:linear-gradient(180deg,#141414,color-mix(in srgb,var(--p) 35%,#141414));padding:96px 18px 84px}.st-premium .hero h1{letter-spacing:.01em}
.st-premium h2{text-transform:uppercase;letter-spacing:.12em;font-size:1rem;color:#333;border-bottom:1px solid color-mix(in srgb,var(--p) 40%,#fff);padding-bottom:10px}
.st-premium section{padding:44px 18px}.st-premium .prod,.st-premium .card{border-radius:4px;box-shadow:none;border:1px solid #0000000f}.st-premium .btn{border-radius:2px;letter-spacing:.06em;text-transform:uppercase;font-size:.85rem}
.st-playful .hero{border-radius:0 0 36px 36px;background:radial-gradient(circle at 20% 20%,color-mix(in srgb,var(--p) 60%,#fff),var(--p))}
.st-playful .prod,.st-playful .card,.st-playful details{border-radius:22px}.st-playful h2{font-size:1.7rem}.st-playful .btn{box-shadow:0 6px 0 #0002}
"""

JS = """
const D=JSON.parse(document.getElementById('store-data').textContent);const cart={};const fmt=n=>'₹'+(Math.round(n*100)/100).toLocaleString('en-IN');
document.querySelectorAll('.langs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.lang').forEach(d=>d.hidden=d.dataset.lang!==b.dataset.l);document.querySelectorAll('.langs button').forEach(x=>x.classList.toggle('on',x===b))});
function render(){let n=0,t=0;for(const[id,q]of Object.entries(cart)){n+=q;t+=q*(D.prices[id]||0)}
document.querySelectorAll('.qty').forEach(el=>el.querySelector('.n').textContent=cart[el.dataset.id]||0);
const bar=document.getElementById('cartbar');bar.style.display=n?'flex':'none';document.getElementById('cartsum').textContent=`🛒 ${n} · ${fmt(t)}`}
document.addEventListener('click',e=>{const q=e.target.closest('.qty');if(!q)return;const id=q.dataset.id;
if(e.target.classList.contains('plus'))cart[id]=Math.min((cart[id]||0)+1,50);if(e.target.classList.contains('minus')){cart[id]=Math.max((cart[id]||0)-1,0);if(!cart[id])delete cart[id]}render()});
const dlg=document.getElementById('checkout');
document.getElementById('cartbtn').onclick=()=>{const ul=document.getElementById('lines');ul.innerHTML='';let t=0;
for(const[id,q]of Object.entries(cart)){const li=document.createElement('li');const a=q*D.prices[id];t+=a;li.textContent=`${D.names[id]} × ${q}`;const s=document.createElement('span');s.textContent=fmt(a);li.appendChild(s);ul.appendChild(li)}
document.getElementById('ctotal').textContent='Total: '+fmt(t);document.getElementById('step1').hidden=false;document.getElementById('step2').hidden=true;dlg.showModal()};
document.getElementById('of').onsubmit=async e=>{e.preventDefault();document.getElementById('oerr').hidden=true;const b=e.target.querySelector('button');b.disabled=true;b.textContent='Placing order…';
const f=Object.fromEntries(new FormData(e.target));const body={slug:D.slug,name:f.name,phone:f.phone,note:f.note||'',items:Object.entries(cart).map(([id,qty])=>({id,qty}))};
try{const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Failed');
document.getElementById('ref').textContent=j.ref;document.getElementById('ptotal').textContent=fmt(j.total);
const pay=document.getElementById('pay');if(j.pay){pay.hidden=false;document.getElementById('qr').innerHTML=j.pay.qr_svg;document.getElementById('upibtn').href=j.pay.upi_link;document.getElementById('vpa').textContent=j.pay.vpa}else pay.hidden=true;
const wa=document.getElementById('wabtn');if(D.wa){wa.hidden=false;wa.href=`https://wa.me/${D.wa}?text=`+encodeURIComponent(`Hi! I placed order ${j.ref} (${fmt(j.total)}) on your website.`)}
document.getElementById('step1').hidden=true;document.getElementById('step2').hidden=false;for(const k in cart)delete cart[k];render();e.target.reset()}
catch(err){const m=document.getElementById("oerr");m.textContent=err.message||"Could not place the order. Please try again.";m.hidden=false}finally{b.disabled=false;b.textContent=D.t.place}};
document.querySelectorAll('.x').forEach(x=>x.onclick=()=>dlg.close());
const cf=document.getElementById('cf');if(cf)cf.onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.slug=D.slug;const s=document.getElementById('cs');s.textContent='Sending…';
let ok=false;try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});ok=r.ok}catch{}s.textContent=ok?'Thanks! We will get back to you soon.':'Could not send — please use WhatsApp.';if(ok)e.target.reset()};
render();
"""


# The inline script never changes (store data rides in a JSON block), so the browser can allow
# exactly this script by its hash and refuse any other: injected markup cannot run code.
JS_HASH = base64.b64encode(hashlib.sha256(JS.encode()).digest()).decode()


def store_csp(ancestors: str) -> str:
    return (f"default-src 'self'; script-src 'sha256-{JS_HASH}'; style-src 'unsafe-inline'; "
            f"img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; "
            f"object-src 'none'; frame-ancestors {ancestors}")


def as_list(v) -> list:
    return v if isinstance(v, list) else []


def as_dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def render_site(site: dict, preview: bool = False, url: str = "", media_base: str = "") -> str:
    """url is the store's public address and media_base the origin that serves /media; both make
    share and search tags absolute (crawlers ignore relative ones)."""
    theme = as_dict(site.get("theme"))
    color = _color(theme.get("primary_color"))
    style = style_of(site)
    background = _color(theme.get("background"), "#fafafa" if style in ("modern", "premium") else "#fffaf5")
    # Defence in depth: skip any malformed entry instead of failing the whole page.
    langs = [l for l in as_list(site.get("content")) if isinstance(l, dict)] or [
        {"lang_code": "en", "lang_label": "English", "hero_title": site.get("business_name"),
         "hero_subtitle": site.get("tagline"), "about": ""}]
    products = [p for p in as_list(site.get("products")) if isinstance(p, dict) and p.get("id")]
    c = as_dict(site.get("contact"))
    wa = re.sub(r"\D", "", c.get("whatsapp") or c.get("phone") or "")
    if len(wa) == 10:
        wa = "91" + wa
    name = site.get("business_name") or "Store"

    store_data = {
        "slug": site.get("slug"),
        "prices": {p["id"]: p.get("price", 0) for p in products},
        "names": {p["id"]: p.get("name") for p in products},
        "wa": wa,
        "t": {"place": "Place order"},
    }
    lang_buttons = "".join(
        f'<button data-l="{_e(l.get("lang_code"))}" class="{"" if i else "on"}">{_e(l.get("lang_label"))}</button>'
        for i, l in enumerate(langs)) if len(langs) > 1 else ""
    place = " · ".join(_e(x) for x in (c.get("address"), c.get("city")) if x)
    hours = f"<p>🕒 {_e(c['hours'])}</p>" if c.get("hours") else ""
    facts = "".join(f"<span>{x}</span>" for x in (
        f"📍 {_e(c['city'])}" if c.get("city") else "",
        f"🕒 {_e(c['hours'])}" if c.get("hours") else "",
        "💳 UPI accepted" if as_dict(site.get("upi")).get("vpa") else "",
        "💬 Order on WhatsApp" if wa else "",
    ) if x)
    facts = f'<div class="facts">{facts}</div>' if facts else ""
    hero_img = next((p["image_id"] for p in products if re.fullmatch(r"[a-f0-9]{16}", str(p.get("image_id", "")))), None)
    hero_bg = (f".hero{{background:linear-gradient(160deg,color-mix(in srgb,{color} 85%,#000c),#000b),"
               f"url(/media/{hero_img}.jpg) center/cover}}") if hero_img else ""
    phone = f'<p>📞 <a href="tel:{_e(c["phone"])}">{_e(c["phone"])}</a></p>' if c.get("phone") else ""
    links = [(n, _social(c.get(k), b)) for n, k, b in (("Instagram", "instagram", "https://instagram.com/"),
                                                       ("Facebook", "facebook", "https://facebook.com/"))]
    social = "".join(f'<a href="{_e(h)}" target="_blank" rel="noopener">{n}</a>' for n, h in links if h)
    social = f'<p class="social">{social}</p>' if social else ""
    seo = as_dict(site.get("seo"))
    title = seo.get("title") or (f"{name} – {site.get('tagline')}" if site.get("tagline") else name)
    description = seo.get("description") or site.get("tagline") or ""
    image = next((f"{media_base}/media/{p['image_id']}.jpg" for p in products if p.get("image_id")), "")
    business = {"@context": "https://schema.org", "@type": _SCHEMA_TYPE.get(str(site.get("category")), "LocalBusiness"),
                "name": name, "description": description, "url": url or None, "image": image or None,
                "telephone": c.get("phone") or c.get("whatsapp") or None,
                "address": {"@type": "PostalAddress", "streetAddress": c.get("address"), "addressLocality": c.get("city"),
                            "addressCountry": "IN"} if (c.get("address") or c.get("city")) else None,
                "sameAs": [h for _, h in links if h] or None}
    ld = json.dumps({k: v for k, v in business.items() if v}, ensure_ascii=False).replace("<", "\\u003c")

    return f"""<!doctype html><html lang="{_e(langs[0].get('lang_code') or 'en')}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(title)}</title>
<meta name="description" content="{_e(description)}">
{f'<meta name="keywords" content="{_e(seo["keywords"])}">' if seo.get("keywords") else ''}
{'<meta name="robots" content="noindex">' if preview else (f'<link rel="canonical" href="{_e(url)}">' if url else '')}
<meta property="og:type" content="website"><meta property="og:title" content="{_e(title)}"><meta property="og:description" content="{_e(description)}">
{f'<meta property="og:url" content="{_e(url)}">' if url else ''}{f'<meta property="og:image" content="{_e(image)}"><meta name="twitter:card" content="summary_large_image">' if image else ''}
<meta name="theme-color" content="{color}">
<script type="application/ld+json">{ld}</script>
<style>:root{{--p:{color};--bg:{background}}}{CSS}{hero_bg}</style></head><body class="st-{style}">
{'<div class="preview">👀 Preview — not live yet. Approve it in VaaniLaunch to publish.</div>' if preview else ''}
{f'<div class="notice">📢 {_e(site["notice"])}</div>' if site.get("notice") else ''}
<nav><div class="brand"><span class="logo">{_e(name[:1])}</span><span class="bn">{_e(name)}</span></div><div class="langs">{lang_buttons}{f'<a class="wa" href="https://wa.me/{wa}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>' if wa else ''}</div></nav>
{''.join(_lang_block(l, i, products, facts, (service_names(site), site.get("service_images"))) for i, l in enumerate(langs))}
<section id="contact"><h2>Contact</h2>{f'<p>📍 {place}</p>' if place else ''}{phone}{hours}{social}
<form id="cf"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email" required>
<textarea name="message" rows="3" placeholder="Message" required></textarea><button class="pbtn">Send message</button><small id="cs"></small></form></section>
<footer>{_e(site.get('tagline'))}<br>Launched with 🎙️ VaaniLaunch</footer>
<div class="cartbar" id="cartbar"><span id="cartsum"></span><button id="cartbtn">Order →</button></div>
<dialog id="checkout">
 <div id="step1"><button class="x" aria-label="close">×</button><h2>Your order</h2><ul class="lines" id="lines"></ul><div class="total" id="ctotal"></div>
  <form id="of"><input name="name" placeholder="Your name" required maxlength="100"><input name="phone" type="tel" placeholder="Phone number" required minlength="6" maxlength="20">
  <textarea name="note" rows="2" placeholder="Address / delivery note (optional)" maxlength="500"></textarea><small class="privacy">Your name, phone and note go only to this store to deliver your order.</small><button class="pbtn">Place order</button><p id="oerr" class="oerr" role="alert" hidden></p></form></div>
 <div id="step2" hidden><button class="x" aria-label="close">×</button><h2>✅ Order placed!</h2>
  <p>Order <b id="ref"></b> · Total <b id="ptotal"></b></p>
  <div id="pay"><p>Pay with any UPI app (GPay, PhonePe, Paytm):</p><div class="qr" id="qr"></div>
   <p style="text-align:center"><a class="pbtn" id="upibtn" style="display:inline-block;text-decoration:none;padding:10px 18px">Pay with UPI app</a><br><small>UPI ID: <span id="vpa"></span></small></p></div>
  <div class="paid-note">Payment status: <b>pending</b> — the owner will confirm once received.</div>
  <p><a id="wabtn" hidden target="_blank" rel="noopener">💬 Message the owner on WhatsApp</a></p></div>
</dialog>
<script type="application/json" id="store-data">{json.dumps(store_data, ensure_ascii=False).replace('<', '\\u003c')}</script>
<script>{JS}</script>
</body></html>"""
