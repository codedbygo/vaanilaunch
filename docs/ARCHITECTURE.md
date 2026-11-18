# VaaniLaunch: architecture

VaaniLaunch turns a voice note in an Indian language into a live, bilingual online store with
UPI payments, on its own HTTPS address, in a few minutes. This page explains how it works.

## The journey

```
Owner speaks (9 languages)      Browser speech recognition, shown as text in the box
        │                       The owner checks or fixes the words, then taps Send
        ▼
AI agent (Claude)               Reads the message and product photos, asks at most 2 questions,
        │                       calls tools: domain search, address, build draft
        ▼
Draft store                     Saved as structured data, rendered as a phone preview
        │                       Nothing is public until the owner taps Approve (enforced on the server)
        ▼
Publish                         Store goes live at <name>.vaanilaunch.in with automatic HTTPS
        │
        ▼
Manage by voice                 "Add biryani ₹180", "cream background", "undo that", "show my orders"
```

## Frontend

React 19 and TypeScript, built with Vite, styled with Tailwind and shadcn/ui. TanStack Router
handles pages, and TanStack Query holds server data. Every response from the server is checked
with Zod before use.

- **One language choice** drives the page text, the microphone and the agent's replies. All
  230 interface sentences exist in Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali,
  Gujarati and English. A build check fails if any language is missing a sentence.
- **Live progress.** The agent streams each step (server-sent events) to a timeline the owner can
  follow. A stream that stays silent for two minutes is stopped, and a Try again button resends
  the same message and photos.

## Speech

The browser's own speech recognition (Web Speech API, in Chrome and Edge) in the chosen language.
It keeps listening until the owner taps the mic again. The words then stay in the text box to be
checked and corrected, and are sent only on Send. Typing always works as well. A blocked
microphone, a missing mic or an unsupported browser each get a plain message in the owner's
language.

## AI and business understanding

Claude (`claude-sonnet-5-5`) runs a tool-using agent with 11 tools. Free models on OpenRouter take
over automatically if Claude is unavailable, and the owner's timeline says which model answered.

- **Structured, not free text.** The store is built through a typed tool schema: business name,
  category, products with prices and photos, services, contact details, hours, social links,
  colours and style, search title and description, and FAQs, in one block per language.
- **Vision.** Product photos become catalogue items with names in two languages and suggested
  prices. The owner is told the prices are suggestions.
- **Honesty rules.** The agent may not invent phone numbers, addresses, hours, emails, social
  links, reviews or testimonials. It asks for them instead. Testimonials appear only if the owner
  gives real ones.
- **Validated output.** Everything the model writes is checked and cleaned before saving. Wrong
  shapes are dropped, and prices, colours and links are validated. A bad answer can never break a
  page.

## Store generation and editing

Stores are rendered on the server from the structured data:
- mobile-first layout, catalogue, cart and UPI checkout with a QR code;
- a WhatsApp button and a language switch;
- four styles (classic, modern, premium, playful), chosen from the business category and
  changeable by voice;
- search tags: title, description, canonical URL, Open Graph, and LocalBusiness structured data.

Voice edits change only the requested fields; everything else is kept. One step of undo restores
the store as it was before the last edit.

## Database

SQLite in WAL mode, one row per store and per order, with an in-memory copy for fast reads. A
backup script makes a consistent copy while the app keeps serving. Customer names and phone
numbers are removed from orders after 90 days.

## Hosting and publishing

One Docker image (FastAPI serves both the API and the built frontend) behind Caddy, on a GoDaddy
VPS. Caddy gets an HTTPS certificate for each store address on first visit, after asking the app
whether that store exists. Production refuses to start if a required setting is missing.

## GoDaddy

- **Domains API:** live domain ideas, availability and prices during the launch. Buying links to
  GoDaddy. This needs an API key on an account GoDaddy allows to use the domain API.
- **DNS:** `vaanilaunch.in` and a wildcard record point at the VPS, so every store address works
  immediately. The agent also tries to create a record per store and falls back to the wildcard.
- **VPS** for hosting and **Professional Email** for order alerts.

## Security

- Owners edit only their own store, through a session or a private key. Rotating the key kills
  the old link.
- Drafts open only with a short-lived preview token.
- Order totals are computed on the server from saved prices.
- Customer-written text can never instruct the agent: write tools are blocked in that turn.
- Store pages run only one known script, enforced by CSP with a hash.
- Abuse limits: rate limits, a proof-of-work for new visitors and daily AI budgets.

## Differentiators

1. **Voice in your own language, end to end.** Not only the input: the whole interface, the
   agent's replies, the store (bilingual) and the owner's emails follow the chosen language.
2. **An agent that does the launch, not a form.** Domain search, web address, catalogue from
   photos, publishing and HTTPS checks, each shown as a real step.
3. **The owner stays in control.** Nothing goes public without Approve, edits are by voice, and
   one tap undoes the last change.
4. **Honest by design.** No invented contact details or reviews, orders stay "pending" until the
   owner confirms the money, and the readiness score counts only real fields.
5. **Ready to sell on day one.** UPI checkout with QR, WhatsApp ordering, order emails, and a
   downloadable QR code for the shop counter.
