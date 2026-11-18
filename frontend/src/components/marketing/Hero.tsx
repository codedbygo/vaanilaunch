import { ArrowRight, Mic } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LANGS, useLocaleStore, useT } from "@/lib/i18n";

import { HeroDemo } from "./HeroDemo";

// In LANGS order, so the visitor's own greeting comes first.
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

function Greeting() {
  // Open with the visitor's own greeting, then rotate.
  const locale = useLocaleStore((s) => s.locale);
  const [i, setI] = useState(() => LANGS.findIndex((l) => l.code === locale));
  // A timer is an outside clock: an effect with cleanup is the right tool.
  useEffect(() => {
    const t = setInterval(() => {
      setI((n) => (n + 1) % GREETINGS.length);
    }, 2200);
    return () => {
      clearInterval(t);
    };
  }, []);
  return (
    <span
      key={i}
      className="inline-flex animate-rise items-center rounded-full border bg-card px-3 py-1 text-sm font-semibold text-saffron"
    >
      {GREETINGS[i]}
    </span>
  );
}

export function Hero({ onStart }: { onStart: () => void }) {
  const { t } = useT();
  return (
    <header
      id="top"
      className="hero-backdrop relative overflow-hidden px-4 pt-14 pb-20 sm:px-8 sm:pt-20"
    >
      <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      {/* Copy on the left, the voice-to-website example on the right (stacked on phones). */}
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="relative z-10">
          <Greeting />
          <h1 className="mt-5 text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t("hero.title1")}
            <span className="block text-saffron">{t("hero.title2")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">{t("hero.lead")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              onClick={onStart}
              size="lg"
              className="h-12 rounded-full px-6 text-base font-semibold"
            >
              <Mic aria-hidden="true" /> {t("hero.cta")}
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-12 rounded-full px-5 text-base">
              <a href="#how">
                {t("hero.cta2")} <ArrowRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <p className="mt-6 text-sm font-medium">{t("hero.points")}</p>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{t("hero.languages")}</p>
        </div>
        <HeroDemo />
      </div>
    </header>
  );
}
