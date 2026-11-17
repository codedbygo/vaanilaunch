# 🎙️ VaaniLaunch

**Speak your business idea in your language. Get a live website in minutes.**

VaaniLaunch is a voice-first, agentic launch assistant for first-time small business owners in India. The owner speaks in their language and adds product photos. A Claude agent then:

1. Understands the business and creates a brand
2. Finds real available domains (GoDaddy Domains API)
3. Builds a bilingual catalogue from the photos (Claude vision)
4. Generates a mobile storefront as a **draft**, which the owner must **approve** with a button press (enforced on the server)
5. Publishes it: **creates the DNS record through the GoDaddy DNS API**, issues HTTPS automatically, then **verifies** DNS and HTTPS
6. Takes orders with a **UPI QR code** (totals always computed on the server) and emails each order through **Titan**
7. Keeps managing the store by voice: "Add biryani ₹180", "Closed Sunday", "Show my orders", "Mark LT-4821 paid"

**Stack:** FastAPI (Python 3.12) · React 18 + Vite · Claude tool use · GoDaddy Domains/DNS API · Titan SMTP · Docker + Caddy

## Architecture

```
React (voice via Web Speech API, 9 Indian languages)
   │  POST /api/agent  →  SSE stream of agent steps
   ▼
FastAPI ──► Claude (tool-use loop, backend/app/agent.py)
   │          ├─ suggest_domains → GoDaddy Domains API
   │          ├─ check_domains   → GoDaddy Domains API
   │          ├─ check_slug      → platform store
   │          └─ publish_site    → render site + GoDaddy DNS API (A record)
   ├─ <slug>.ROOT_DOMAIN → generated site (middleware)
   ├─ /api/contact → aiosmtplib → Titan mailbox
   └─ /            → built React app
Caddy (on-demand TLS for every subdomain) ── Docker Compose on GoDaddy VPS
```

## Feature checklist

| Feature | Where |
|---|---|
| Voice in 9 Indian languages | `frontend/src/useSpeech.js` |
| Claude tool-use agent (10 tools) | `backend/app/agent.py` |
| Catalogue from photos (vision) | `/api/upload` + images in the agent turn |
| Owner approval before publishing | `save_draft` → `/api/approve` → `publish_site` |
| GoDaddy domain search, availability, DNS | `backend/app/godaddy.py` |
| Live check after publishing (DNS + HTTPS) | `verify_site` tool |
| Cart, orders, UPI QR, order emails | `/api/orders`, `site_render.py`, `notify.py` |
| Voice updates and order management | `update_site`, `list_orders`, `update_order` + secret manage link |
| Cost controls | prompt caching of the whole history (photos included), images resized to 1024 px, daily call cap with a per-IP share, rate limits |

## Project layout

```
backend/app/   main.py (routes) · agent.py (Claude loop + tools) · godaddy.py · notify.py (email + UPI) · site_render.py (storefront) · db.py · config.py
frontend/src/  App.jsx · api.js (SSE client) · useSpeech.js (voice) · index.css
Dockerfile     multi-stage: builds React, then runs FastAPI serving API + static files
Caddyfile      automatic HTTPS for the domain + all generated subdomains
```

## Run locally

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY; keep ROOT_DOMAIN and SERVER_IP empty locally

# Backend
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
set -a; source ../.env; set +a
uvicorn app.main:app --port 8000

# Frontend, option A: one server (build once, then open http://localhost:8000)
cd frontend && npm install && npm run build

# Frontend, option B: hot reload (new terminal, open http://localhost:5173)
cd frontend && npm install && npm run dev
# with option B, also export PUBLIC_BASE_URL=http://localhost:5173 before starting the backend
```

Live stores open at `http://localhost:8000/s/<slug>`. A draft opens only from the app's preview
(it carries the owner's key), and drafts don't take orders. Without GoDaddy keys the agent says
domain search is unavailable; without SMTP settings orders still work and emails are skipped.

Voice input needs Chrome or Edge, and a secure origin (`localhost` or HTTPS).

## Tests

```bash
cd backend && pip install pytest && python -m pytest -q tests
```

The suite drives the whole demo (photos, draft, blocked publish, approval, publish, verify,
order with UPI, voice update) through the real API and tools, with a scripted stand-in for
Claude, plus the approval, ownership, prompt-injection, pricing and escaping guards.

## Deploy on the GoDaddy VPS (Docker)

1. **SSH:** `ssh-keygen -t ed25519`, add the public key to the server, then `ssh user@SERVER_IP`.
2. **Docker:** `curl -fsSL https://get.docker.com | sh`
3. **DNS** for `yourdomain.in` (on godaddy.com or with the `gddy` CLI):
   - `A  @  → SERVER_IP`
   - `A  *  → SERVER_IP` (wildcard, so every generated site resolves instantly)
4. Copy the code to the server, `cp .env.example .env`, then fill in every value.
5. Firewall: `ufw allow 22,80,443/tcp`
6. `docker compose up -d --build`, then open `https://yourdomain.in`
7. Logs: `docker compose logs -f app`

## Notes

- If the GoDaddy domain availability API returns **403**, check you are using a **Production** key and ask the organizers. The rest of the app still works.
- If the SMTP login fails, keep `SMTP_HOST=smtpout.secureserver.net` and use the full email address as the username.
- Secrets live only in `.env`, which git ignores.
