import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

import { Wave } from "./Wave";

function Section({
  id,
  title,
  sub,
  children,
}: {
  id?: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-12 sm:pt-24">
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-2.5 mb-7 max-w-2xl text-lg text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

const HOW = [
  [
    "🎙️",
    "Speak",
    "Describe your business in any of 9 Indian languages. The agent asks at most two short questions.",
  ],
  [
    "📷",
    "Add photos",
    "Claude reads each photo and writes the product name, a description in two languages and a suggested price.",
  ],
  [
    "👀",
    "Approve",
    "You see the real store on a phone preview. Nothing goes public until you tap Approve.",
  ],
  [
    "🚀",
    "Sell",
    "The agent creates the DNS record on GoDaddy and checks HTTPS. Customers order and pay by UPI; you get an email.",
  ],
] as const;

export function HowItWorks() {
  return (
    <Section
      id="how"
      title="From a voice note to a live store"
      sub="The owner talks. The agent does the technical work, out loud, in a panel anyone can follow."
    >
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW.map(([icon, title, text], i) => (
          <li key={title}>
            <Card className="relative h-full gap-2 border-0 p-5.5 shadow-soft">
              <span
                aria-hidden="true"
                className="absolute top-4 right-5 text-4xl font-extrabold text-secondary"
              >
                {i + 1}
              </span>
              <span aria-hidden="true" className="text-3xl">
                {icon}
              </span>
              <h3 className="mt-2 text-lg font-bold">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const TRUST = [
  [
    "✋",
    "You approve first",
    "The server refuses to publish until the owner presses Approve. Any change needs a new approval.",
  ],
  [
    "💸",
    "Honest payments",
    'Orders stay "pending" until the owner confirms the money arrived. A QR code is never treated as payment.',
  ],
  [
    "🧮",
    "Server-side totals",
    "Totals come from the store's saved prices. Prices sent by a browser are ignored.",
  ],
  [
    "🔑",
    "Your store, your key",
    "Only the owner's session or private manage link can edit the store or see orders. Customer text can't command the agent.",
  ],
] as const;

export function Trust() {
  return (
    <Section
      id="trust"
      title="Responsible by design"
      sub="The agent acts, the owner stays in control. Every rule below is enforced in code, not just in the prompt."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TRUST.map(([icon, title, text]) => (
          <Card key={title} className="flex-row items-start gap-4 border-0 p-5.5 shadow-soft">
            <span
              aria-hidden="true"
              className="grid size-12 flex-none place-items-center rounded-2xl bg-accent text-2xl"
            >
              {icon}
            </span>
            <div>
              <h3 className="mb-1 font-bold">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

const POWERED = [
  {
    name: "Claude",
    tone: "text-saffron",
    items: [
      "Plans the launch with 10 tools",
      "Vision turns photos into a catalogue",
      "Writes and replies in the owner's language",
    ],
  },
  {
    name: "GoDaddy",
    tone: "text-godaddy-soft",
    items: [
      "Domains API: ideas, availability, prices",
      "DNS API: an A record per store",
      "VPS + Titan email for orders",
    ],
  },
];

export function Powered() {
  return (
    <section
      className="mx-auto max-w-6xl px-4 pt-16 sm:px-12 sm:pt-24"
      aria-label="Built with Claude and GoDaddy"
    >
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-3xl bg-night p-8 text-white sm:gap-12 sm:p-11">
        {POWERED.map((p, i) => (
          <div key={p.name} className="contents">
            {i > 0 && (
              <div aria-hidden="true" className="text-4xl font-light text-white/40">
                ×
              </div>
            )}
            <div className="max-w-sm flex-1 basis-64">
              <div className={`text-3xl font-extrabold ${p.tone}`}>{p.name}</div>
              <ul className="mt-2.5 list-disc pl-5 text-night-foreground">
                {p.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 flex flex-wrap justify-between gap-2.5 border-t px-4 py-7 text-sm sm:px-12">
      <div className="flex items-center gap-1.5">
        <Wave className="size-4.5" /> <b>VaaniLaunch</b> · Lakshmi didn&apos;t learn to build a
        website. She just spoke.
      </div>
      <div className="text-muted-foreground">
        Built with Claude + GoDaddy for the GoDaddy Inclusive Innovation Hackathon 2026
      </div>
    </footer>
  );
}
