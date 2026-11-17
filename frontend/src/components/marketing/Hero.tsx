import { Mic } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { HeroDemo } from "./HeroDemo";

const GREETINGS = [
  "నమస్తే",
  "नमस्ते",
  "வணக்கம்",
  "ನಮಸ್ಕಾರ",
  "നമസ്കാരം",
  "नमस्कार",
  "নমস্কার",
  "નમસ્તે",
  "Hello",
];

const STATS = [
  ["63M", "small businesses in India; many sell only on WhatsApp"],
  ["₹5k to 20k", "for a professionally built website"],
  ["₹0", "to launch on VaaniLaunch"],
] as const;

function Greeting() {
  const [i, setI] = useState(0);
  // A timer is an outside clock: an effect with cleanup is the right tool.
  useEffect(() => {
    const t = setInterval(() => {
      setI((n) => (n + 1) % GREETINGS.length);
    }, 1600);
    return () => {
      clearInterval(t);
    };
  }, []);
  // Sized relative to the headline (em), so it scales with every breakpoint of the h1.
  return (
    <span key={i} className="inline-block animate-rise text-[0.62em] font-bold text-saffron">
      {GREETINGS[i]}
    </span>
  );
}

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <header
      id="top"
      className="hero-backdrop relative overflow-hidden px-4 pt-14 pb-20 text-white sm:px-12 sm:pt-24 sm:pb-24"
    >
      <div
        className="dot-grid pointer-events-none absolute inset-0 opacity-50"
        aria-hidden="true"
      />
      {/* The demo card keeps a fixed 400 px column; the copy takes the rest. */}
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-5 inline-block rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-sm text-saffron">
            GoDaddy Inclusive Innovation Hackathon 2026
          </div>
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <Greeting />
            <br />
            Speak your business.
            <br />
            <span className="text-brand">Go live in 3 minutes.</span>
          </h1>
          <p className="mt-6 mb-8 max-w-2xl text-lg text-night-foreground sm:text-xl">
            VaaniLaunch is an AI agent for India&apos;s home businesses. Tell it what you sell, in
            your language, add a few photos, and it builds a bilingual online store with UPI
            payments, a real domain search and order emails. No forms. No English needed.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={onStart}
              size="lg"
              className="h-14 rounded-full bg-brand px-7 text-lg font-bold text-white shadow-brand"
            >
              <Mic aria-hidden="true" /> Start speaking
            </Button>
            <span className="max-w-md text-sm text-night-foreground/80">
              Telugu · Hindi · Tamil · Kannada · Malayalam · Marathi · Bengali · Gujarati · English
            </span>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-1 gap-3.5 sm:grid-cols-3">
            {STATS.map(([value, label]) => (
              <div
                key={value}
                className="rounded-2xl border border-white/10 bg-white/5 px-4.5 py-4"
              >
                <dd className="text-2xl font-extrabold sm:text-3xl">{value}</dd>
                <dt className="text-sm text-night-foreground/80">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <HeroDemo />
      </div>
    </header>
  );
}
