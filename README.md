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

**Stack:** FastAPI (Python 3.12) · React 19 + TypeScript + Vite · Tailwind v4 + shadcn/ui · TanStack Router + Query · Zod · Claude tool use · GoDaddy Domains/DNS API · Titan SMTP · Docker + Caddy

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
| Voice in 9 Indian languages | `frontend/src/features/agent/useSpeech.ts` |
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
frontend/src/  app/ (router, providers, stores) · features/agent (studio, SSE client, voice) · features/manage (owner dashboard) · features/stores · features/contact · components/ui (shadcn)
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

## Security and privacy

- **Owner approval:** the server refuses to publish until the owner taps Approve; any change resets it.
- **Private links:** drafts open only with a 2-hour preview token (`/s/<slug>?t=`); the permanent key never
  goes in a URL or log, and the owner can reset it from the dashboard.
- **Customer text can't steer the agent:** once order notes are read, no store or order changes in that turn.
- **Owner email confirmation:** orders go to an owner's address only after they click the confirmation link.
- **Abuse limits:** proof of work on a new visitor's first message, per-IP (per IPv6 /64) rate limits, a daily
  AI budget with a reserve for existing owners, body-size limits, JSON-only POSTs.
- **Headers:** strict Content Security Policy (store pages allow only their own script by hash), nosniff,
  no-referrer, frame-ancestors; the phone preview is sandboxed.
- **Privacy:** customer phones are masked for the AI; customer details are removed after `ORDER_PII_DAYS`;
  unused photos are deleted after `ORPHAN_UPLOAD_HOURS`.

## Models: Claude first, a free model as backup

Claude runs the agent. A free model behind any OpenAI-compatible API (Gemini free tier, Groq,
OpenRouter, or a local Ollama) can back it up, so the app does not depend on one provider:

| `.env` | Effect |
|---|---|
| `LLM_PROVIDER=claude`, `LLM_FALLBACK=free` | Claude; if it is unreachable, rate-limited, down or out of credits, that turn runs on the free model |
| `LLM_PROVIDER=free` | Everything on the free model: local testing at no Claude cost |
| `LLM_PROVIDER=claude`, `LLM_FALLBACK=none` | Claude only |

Set `FREE_LLM_BASE_URL`, `FREE_LLM_API_KEY` and `FREE_LLM_MODEL` (examples in `.env.example`).
The conversation stays in one format, so a launch can switch models midway. Free models are
weaker at tool use and Indian languages; use Claude for the demo.

Fully offline UI testing without any model: `uvicorn --app-dir dev mock_claude:app --port 8765`
(from `backend/`) and `ANTHROPIC_BASE_URL=http://127.0.0.1:8765`. It plays a scripted launch.

## Tests

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest -q tests --cov=app --cov-branch --cov-fail-under=100
cd frontend && npm run check   # prettier, eslint, tsc, vitest; fails below 100% coverage
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

## Production

- **Production mode:** the Docker image sets `APP_ENV=production`. At startup the app checks its
  settings and **refuses to start** if anything required is missing or unsafe (domain, server IP, SMTP,
  model keys, proof-of-work strength, https base URL), listing every problem. Locally it only warns.
- **Health:** `/healthz` (process alive) and `/readyz` (database accepts writes, disk has room).
  Docker's health check uses `/readyz`; Caddy starts only once the app is healthy.
- **Data:** SQLite at `/data/vaanilaunch.db` (WAL journal, one row per write), uploads in `/data/uploads`,
  the signing secret in `/data/secret.key`. Old `sites.json` / `orders.json` are imported on first start.
- **Backups:** `./scripts/backup.sh` writes `backups/vaanilaunch-<time>.tar.gz` while the app keeps
  serving. Copy it off the server (and schedule it with cron, e.g. daily).
- **Logs:** one JSON object per line, with a `request_id` that is also returned in the `X-Request-ID`
  header, so a customer's problem can be found from the ID. Docker rotates logs (5 x 10 MB).
- **Limits:** one app worker by design (sessions and rate limits live in memory); 1 GB memory cap;
  read-only container filesystem; HSTS from Caddy.
- **Dependencies:** Python packages install from `backend/requirements.lock` with hashes. After
  changing `backend/requirements.txt`, regenerate it:
  `uv pip compile backend/requirements.txt --generate-hashes --python-version 3.12 --universal -o backend/requirements.lock`
- **CI:** `.github/workflows/ci.yml` runs both test suites (each fails below 100% coverage), the frontend
  build, the Docker build, and checks that production refuses to start without its settings.

## Notes

- If the GoDaddy domain availability API returns **403**, check you are using a **Production** key and ask the organizers. The rest of the app still works.
- Titan SMTP: `SMTP_HOST=smtp.titan.email`, `SMTP_PORT=465`, username is the full mailbox address. (Old GoDaddy Workspace mail uses `smtpout.secureserver.net` instead.)
- Secrets live only in `.env`, which git ignores.
