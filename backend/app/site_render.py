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


_ICON_PATHS = {
    "pin": '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "card": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    "chat": '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    "phone": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
}


def _ic(name: str) -> str:
    return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">{_ICON_PATHS[name]}</svg>'


def _lang_block(l: dict, i: int, products: list, facts: str = "", svc: tuple = ((), {}),
                page: dict | None = None) -> str:
    page = page or {}
    wa, place, about_pic = page.get("wa", ""), page.get("place", ""), page.get("about_pic")
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
    cta = (f'<a class="btn" href="#menu-{i}">{_e(l.get("cta") or "Order now")} {_ic("arrow")}</a>' if products
           else f'<a class="btn" href="#services-{i}">{_e(l.get("cta") or "See services")} {_ic("arrow")}</a>' if services else "")
    wa_btn = f'<a class="btn ghost" href="https://wa.me/{_e(wa)}" target="_blank" rel="noopener">{_ic("chat")} WhatsApp</a>' if wa else ""
    about_img = f'<img src="/media/{_e(about_pic)}.jpg" alt="" loading="lazy">' if about_pic else ""
    head = lambda key, default, kicker: f'<span class="kicker">{_e(kicker)}</span><h2>{_e(l.get(key) or default)}</h2>'
    return f"""
<div class="lang" data-lang="{_e(l.get('lang_code'))}" {'hidden' if i else ''}>
  <header class="hero"><div class="wrap">{f'<span class="eyebrow">{_ic("pin")} {_e(place)}</span>' if place else ''}<h1>{_e(l.get('hero_title'))}</h1><p>{_e(l.get('hero_subtitle'))}</p><div class="ctas">{cta}{wa_btn}</div></div></header>
  {facts}
  {f'<section id="menu-{i}">{head("products_heading", "Our products", "Menu")}<div class="prods">{prods}</div></section>' if prods else ''}
  {f'<section id="services-{i}">{head("services_heading", "Services", "What we offer")}<div class="grid">{services}</div></section>' if services else ''}
  <section>{head("about_heading", "About", "Our story")}<div class="about{' has-img' if about_img else ''}"><p>{_e(l.get('about'))}</p>{about_img}</div></section>
  {f'<section>{head("testimonials_heading", "What customers say", "Reviews")}<div class="grid">{quotes}</div></section>' if quotes else ''}
  {f'<section>{head("faq_heading", "FAQ", "Questions")}{faqs}</section>' if faqs else ''}
</div>"""


CSS = r"""
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI','Noto Sans','Noto Sans Telugu','Noto Sans Devanagari',sans-serif;color:#1d1d1f;background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;padding-bottom:84px}
img{max-width:100%}a{color:inherit}
.wrap{max-width:1120px;margin:auto;padding:0 20px}
.notice{background:#1d1d1f;color:#fff;text-align:center;padding:9px 14px;font-size:.9rem}
.preview{background:#fff3bf;color:#5c4400;text-align:center;padding:8px;font-size:.9rem;font-weight:600}
.ic{width:18px;height:18px;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,#fff 86%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid #0000000d}
nav .wrap{display:flex;justify-content:space-between;align-items:center;gap:10px;height:64px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.08rem;letter-spacing:-.01em;min-width:0}
.logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--p) 70%,#fff),var(--p) 55%,color-mix(in srgb,var(--p) 70%,#000));color:#fff;display:grid;place-items:center;font-family:Georgia,'Noto Serif',serif;font-size:1.25rem;font-weight:600;flex:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 18%,transparent),0 4px 12px color-mix(in srgb,var(--p) 30%,transparent)}
.logoimg{width:44px;height:44px;background:#fff;overflow:hidden;box-shadow:0 0 0 1px #0000000f,0 4px 12px #00000014}
.logoimg img{width:100%;height:100%;object-fit:cover;transform:scale(1.6)}
.bn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navr{display:flex;align-items:center;gap:8px}
.navlink{font-size:.92rem;text-decoration:none;opacity:.75;padding:6px 8px}.navlink:hover{opacity:1}
.langs{display:flex;background:#0000000a;border-radius:999px;padding:3px}
.langs button{border:0;background:none;color:#333;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:.82rem}
.langs button.on{background:#fff;color:#111;box-shadow:0 1px 4px #0000001f;font-weight:600}
.wa{display:inline-flex;align-items:center;gap:6px;background:#25d366;color:#fff;text-decoration:none;border-radius:999px;padding:8px 14px;font-size:.88rem;font-weight:600}
.hero{position:relative;color:#fff;background:linear-gradient(135deg,var(--p),color-mix(in srgb,var(--p) 50%,#000));overflow:hidden}
.hero .wrap{min-height:min(76vh,640px);display:flex;flex-direction:column;justify-content:flex-end;padding-top:90px;padding-bottom:110px}
.eyebrow{display:inline-flex;align-self:flex-start;gap:8px;align-items:center;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;background:#ffffff26;border:1px solid #ffffff40;border-radius:999px;padding:5px 12px;backdrop-filter:blur(6px)}
.hero h1{font-size:clamp(2.3rem,7vw,4.4rem);line-height:1.05;margin:16px 0 12px;letter-spacing:-.025em;max-width:16ch;text-wrap:balance}
.hero p{margin:0;font-size:clamp(1.02rem,2.4vw,1.25rem);opacity:.92;max-width:52ch}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.btn{display:inline-flex;align-items:center;gap:8px;background:#fff;color:#111;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:700;box-shadow:0 8px 24px #0000002e;transition:transform .2s}
.btn:hover{transform:translateY(-2px)}.btn.ghost{background:#ffffff1f;color:#fff;border:1px solid #ffffff59;box-shadow:none;backdrop-filter:blur(6px)}
.facts{position:relative;z-index:2;margin:-56px auto 0;max-width:1080px;width:calc(100% - 40px);background:#fff;border-radius:20px;box-shadow:0 18px 50px #00000014;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.facts span{display:flex;align-items:center;gap:10px;padding:18px 20px;font-size:.93rem;font-weight:500}
.facts span+span{border-left:1px solid #0000000d}.facts .ic{color:var(--p);width:20px;height:20px}
section{max-width:1120px;margin:auto;padding:72px 20px 8px}
.kicker{display:block;color:var(--p);font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}
h2{font-size:clamp(1.7rem,4vw,2.4rem);line-height:1.15;margin:0 0 28px;letter-spacing:-.02em}
.prods{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
@media(min-width:700px){.prods{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:22px}}
.prod{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 1px 2px #0000000a,0 8px 28px #0000000d;display:flex;flex-direction:column;transition:transform .25s,box-shadow .25s}
.prod:hover,.svc:hover{transform:translateY(-4px);box-shadow:0 2px 4px #0000000a,0 18px 40px #00000017}
.prod img,.prod .ph{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;transition:transform .5s}
.prod:hover img,.svc:hover img{transform:scale(1.05)}
.prod .ph{display:grid;place-items:center;font-size:4rem;line-height:1;background:radial-gradient(circle at 50% 40%,#fff,color-mix(in srgb,var(--p) 14%,#fff))}
.pb{padding:14px 16px 16px;display:flex;flex-direction:column;flex:1;position:relative;background:#fff}.pb h3{margin:0;font-size:1.04rem;letter-spacing:-.01em}.sec{color:#86868b;font-size:.85rem}
.pb p{color:#6e6e73;font-size:.9rem;margin:6px 0 14px;flex:1;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.row{display:flex;justify-content:space-between;align-items:center;gap:6px}.row strong{font-size:1.12rem}.row strong small{display:block;font-weight:500;color:#86868b;font-size:.74rem}
.qty{display:flex;align-items:center;gap:8px;background:#0000000a;border-radius:999px;padding:3px}.qty .n{min-width:14px;text-align:center;font-weight:600}
.qty button{width:32px;height:32px;border-radius:50%;border:0;background:var(--p);color:#fff;font-size:1.1rem;cursor:pointer}
.qty .minus{background:#fff;color:#333;box-shadow:0 1px 3px #0000001a}.soldout{color:#b00020;font-size:.85rem;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
.card{background:#fff;border-radius:18px;padding:20px;box-shadow:0 1px 2px #0000000a,0 8px 28px #0000000d}
.svc{padding:0;overflow:hidden;display:flex;flex-direction:column;transition:transform .25s,box-shadow .25s}
.svc img,.svc .ph{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;transition:transform .5s}
.svc .ph{display:grid;place-items:center;font-size:3.4rem;line-height:1;background:radial-gradient(circle at 50% 40%,#fff,color-mix(in srgb,var(--p) 14%,#fff))}
.svc h3{margin:16px 18px 4px;font-size:1.05rem;position:relative;background:#fff}.svc p{margin:0 18px;color:#6e6e73;font-size:.9rem;flex:1}
.svc strong{display:inline-block;margin:14px 18px 18px;align-self:flex-start;background:color-mix(in srgb,var(--p) 12%,#fff);color:color-mix(in srgb,var(--p) 80%,#000);border-radius:999px;padding:5px 12px;font-size:.92rem}
.about{display:grid;gap:36px;align-items:center}@media(min-width:800px){.about.has-img{grid-template-columns:1.1fr .9fr}}
.about p{font-size:1.08rem;color:#424245;margin:0;white-space:pre-line}
.about img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:22px;box-shadow:0 18px 50px #00000017}
figure.card{margin:0;position:relative;padding-top:42px}figure.card:before{content:"\201C";position:absolute;top:2px;left:18px;font-size:4rem;line-height:1;color:var(--p);opacity:.35;font-family:Georgia,serif}
blockquote{margin:0 0 10px;font-size:1.02rem}figcaption{color:#6e6e73;font-size:.88rem;font-weight:600}
details{background:#fff;border-radius:14px;padding:16px 20px;margin:10px 0;box-shadow:0 1px 2px #0000000a}
summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px}summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--p);font-size:1.4rem;line-height:1}details[open] summary:after{content:"\2212"}details p{color:#6e6e73;margin:10px 0 0}
.contact{display:grid;gap:22px}@media(min-width:800px){.contact{grid-template-columns:.9fr 1.1fr}}
.cinfo{display:grid;gap:14px;align-content:start}.cinfo p{display:flex;gap:12px;align-items:flex-start;margin:0}.cinfo .ic{color:var(--p);margin-top:3px}
.cbtns{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}.cbtn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 18px;text-decoration:none;font-weight:600;border:1px solid #0000001a;background:#fff}
.cbtn.green{background:#25d366;color:#fff;border-color:#25d366}.social a{margin-right:14px;font-weight:600;color:var(--p)}
form{display:grid;gap:10px}input,textarea{padding:12px 14px;border:1px solid #0000001f;border-radius:12px;font:inherit;width:100%;background:#fff}
input:focus,textarea:focus{outline:2px solid color-mix(in srgb,var(--p) 40%,transparent);border-color:var(--p)}
.pbtn{background:var(--p);color:#fff;border:0;padding:13px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}
.cartbar{position:fixed;left:12px;right:12px;bottom:12px;max-width:640px;margin:auto;background:#1d1d1f;color:#fff;border-radius:18px;padding:12px 14px 12px 20px;display:none;justify-content:space-between;align-items:center;box-shadow:0 12px 32px #0000003d;z-index:30}
.cartbar button{background:var(--p);color:#fff;border:0;border-radius:12px;padding:10px 18px;font:inherit;font-weight:700;cursor:pointer}
.fab{position:fixed;right:16px;bottom:16px;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 10px 26px #25d36666;z-index:25}
.fab .ic{width:26px;height:26px}@media(min-width:800px){.fab{display:none}}
footer{margin-top:80px;background:#111;color:#c7c7cc;padding:44px 20px 110px}footer .wrap{display:grid;gap:8px}
footer b{color:#fff;font-size:1.1rem}footer small{color:#8e8e93}
dialog{border:0;border-radius:20px;padding:22px;width:min(440px,92vw);max-height:90vh;box-shadow:0 30px 80px #0000004d}dialog::backdrop{background:#0009;backdrop-filter:blur(3px)}
.lines{margin:0 0 12px;padding:0;list-style:none}.lines li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #eee}
.total{font-weight:700;font-size:1.1rem;text-align:right;margin-bottom:12px}
.qr{width:220px;margin:8px auto;display:block}.qr svg{width:100%;height:auto}
.paid-note{background:#fff8e1;border-radius:10px;padding:10px;font-size:.85rem;margin-top:10px}
.x{float:right;background:none;border:0;font-size:1.5rem;cursor:pointer}
.privacy{color:#86868b;font-size:.78rem}
.oerr{color:#b00020;background:#fdecee;border-radius:10px;padding:8px 10px;margin:0;font-size:.9rem}
@media(prefers-reduced-motion:no-preference){.hero .wrap>*{animation:up .7s both}.hero .wrap>*:nth-child(2){animation-delay:.08s}.hero .wrap>*:nth-child(3){animation-delay:.16s}.hero .wrap>*:nth-child(4){animation-delay:.24s}}
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media(max-width:600px){.navlink{display:none}.wa span{display:none}.wa{padding:9px}.facts span+span{border-left:0;border-top:1px solid #0000000d}.hero .wrap{padding-bottom:96px}}
.st-modern .prod,.st-modern .card,.st-modern details,.st-modern .facts{border-radius:10px}.st-modern .btn,.st-modern .pbtn{border-radius:10px}
.st-modern h2{letter-spacing:-.03em}
.st-premium{--serif:Georgia,'Noto Serif','Noto Serif Telugu','Noto Serif Devanagari',serif}
.st-premium h1,.st-premium h2,.st-premium .brand,.st-premium .pb h3,.st-premium .svc h3{font-family:var(--serif);font-weight:600}
.st-premium .hero{background:linear-gradient(180deg,#141414,color-mix(in srgb,var(--p) 30%,#141414))}
.st-premium .kicker{letter-spacing:.24em}.st-premium .prod,.st-premium .card,.st-premium .facts{border-radius:6px}
.st-premium .btn{border-radius:4px;letter-spacing:.06em;text-transform:uppercase;font-size:.84rem}.st-premium .logo{border-radius:50%}
.st-playful .prod,.st-playful .card,.st-playful details,.st-playful .facts{border-radius:26px}.st-playful .btn{box-shadow:0 6px 0 #0003}
.st-playful .hero{background:radial-gradient(circle at 20% 15%,color-mix(in srgb,var(--p) 55%,#fff),var(--p) 60%)}
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
    pics = [p["image_id"] for p in products if re.fullmatch(r"[a-f0-9]{16}", str(p.get("image_id", "")))]
    svc_pics = [v for v in as_dict(site.get("service_images")).values() if isinstance(v, str) and re.fullmatch(r"[a-f0-9]{16}", v)]
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
    hours = f"<p>{_ic('clock')}<span>{_e(c['hours'])}</span></p>" if c.get("hours") else ""
    facts = "".join(f"<span>{x}</span>" for x in (
        f"{_ic('pin')} {_e(c['city'])}" if c.get("city") else "",
        f"{_ic('clock')} {_e(c['hours'])}" if c.get("hours") else "",
        f"{_ic('card')} UPI accepted" if as_dict(site.get("upi")).get("vpa") else "",
        f"{_ic('chat')} {'Order' if products else 'Book'} on WhatsApp" if wa else "",
    ) if x)
    facts = f'<div class="facts">{facts}</div>' if facts else ""
    hero_img = next(iter(pics + svc_pics), None)
    # Doubled class: a store's own photo beats every style's default hero background.
    hero_bg = (f"body .hero.hero{{background:linear-gradient(180deg,#0003 0%,#0006 45%,color-mix(in srgb,{color} 55%,#000d) 100%),"
               f"url(/media/{hero_img}.jpg) center/cover}}") if hero_img else ""
    phone = f'<p>{_ic("phone")}<a href="tel:{_e(c["phone"])}">{_e(c["phone"])}</a></p>' if c.get("phone") else ""
    all_pics = pics + svc_pics
    about_pic = all_pics[1] if len(all_pics) > 1 else (all_pics[0] if all_pics else None)
    logo_id = str(site.get("logo_id") or "")
    logo = (f'<span class="logo logoimg"><img src="/media/{logo_id}.jpg" alt=""></span>' if re.fullmatch(r"[a-f0-9]{16}", logo_id)
            else f'<span class="logo">{_e(name[:1])}</span>')
    page = {"wa": wa, "place": _e(c.get("city") or c.get("address") or ""), "about_pic": about_pic}
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
{f'<link rel="icon" href="/media/{logo_id}.jpg">' if re.fullmatch(r"[a-f0-9]{16}", logo_id) else ''}
<script type="application/ld+json">{ld}</script>
<style>:root{{--p:{color};--bg:{background}}}{CSS}{hero_bg}</style></head><body class="st-{style}">
{'<div class="preview">👀 Preview — not live yet. Approve it in VaaniLaunch to publish.</div>' if preview else ''}
{f'<div class="notice">📢 {_e(site["notice"])}</div>' if site.get("notice") else ''}
<nav><div class="wrap"><div class="brand">{logo}<span class="bn">{_e(name)}</span></div><div class="navr"><a class="navlink" href="#contact">Contact</a>{f'<div class="langs">{lang_buttons}</div>' if lang_buttons else ''}{f'<a class="wa" href="https://wa.me/{wa}" target="_blank" rel="noopener" aria-label="WhatsApp">{_ic("chat")}<span>WhatsApp</span></a>' if wa else ''}</div></div></nav>
{''.join(_lang_block(l, i, products, facts, (service_names(site), site.get("service_images")), page) for i, l in enumerate(langs))}
<section id="contact"><span class="kicker">Visit or message us</span><h2>Contact</h2><div class="contact"><div class="card cinfo">{f'<p>{_ic("pin")}<span>{place}</span></p>' if place else ''}{phone}{hours}{social}
<div class="cbtns">{f'<a class="cbtn" href="tel:{_e(c["phone"])}">{_ic("phone")} Call</a>' if c.get("phone") else ''}{f'<a class="cbtn green" href="https://wa.me/{wa}" target="_blank" rel="noopener">{_ic("chat")} WhatsApp</a>' if wa else ''}</div></div>
<form id="cf" class="card"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="Email" required>
<textarea name="message" rows="4" placeholder="Message" required></textarea><button class="pbtn">Send message</button><small id="cs"></small></form></div></section>
<footer><div class="wrap"><b>{_e(name)}</b><span>{_e(site.get('tagline'))}</span><small>Website made with VaaniLaunch</small></div></footer>
{f'<a class="fab" href="https://wa.me/{wa}" target="_blank" rel="noopener" aria-label="WhatsApp">{_ic("chat")}</a>' if wa else ''}
<div class="cartbar" id="cartbar"><span id="cartsum"></span><button id="cartbtn">Checkout →</button></div>
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
