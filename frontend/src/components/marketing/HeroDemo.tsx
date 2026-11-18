import { ArrowDown, MessageCircle, Mic } from "lucide-react";

import { useT } from "@/lib/i18n";

// Heights of the waveform bars (px); each bar breathes on its own delay.
const BARS = [10, 18, 28, 16, 34, 22, 12, 26, 32, 14, 24, 18, 30, 12, 20];

const MENU = [
  ["Veg meals", "₹120"],
  ["Pesarattu", "₹60"],
  ["Idli (2)", "₹40"],
] as const;

/**
 * The product in one picture: a spoken request becomes a website. It is an illustration,
 * labelled "Example", not a customer's store; real stores appear in the gallery below.
 */
export function HeroDemo() {
  const { t, locale } = useT();
  return (
    <figure aria-label={t("demo.example")} className="relative z-10 mx-auto w-full max-w-md">
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {t("demo.example")}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-rose">
            <span className="size-1.5 animate-pulse rounded-full bg-rose" aria-hidden="true" />
            {t("demo.listening")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="grid size-14 flex-none place-items-center rounded-full bg-saffron text-white shadow-brand">
            <Mic className="size-6" aria-hidden="true" />
          </span>
          <div className="flex h-10 flex-1 items-center gap-1" aria-hidden="true">
            {BARS.map((h, i) => (
              <span
                key={i}
                className="wave-bar w-1 rounded-full bg-saffron/70"
                style={{ height: `${String(h)}px`, animationDelay: `${String(i * 70)}ms` }}
              />
            ))}
          </div>
        </div>
        <blockquote className="mt-4 text-sm leading-relaxed">
          <p lang="te" className="font-medium">
            {t("demo.quote")}
          </p>
          {/* The spoken example is Telugu; a Telugu page needs no translation line. */}
          {locale !== "te-IN" && (
            <p className="mt-1 text-muted-foreground">{t("demo.quoteTranslation")}</p>
          )}
        </blockquote>
      </div>

      <div className="flex justify-center py-2 text-muted-foreground" aria-hidden="true">
        <ArrowDown className="size-4" />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="bg-success px-5 py-6 text-white">
          <p className="text-lg font-bold">Annapurna Veg Meals</p>
          <p className="text-sm opacity-85">{t("demo.siteTagline")}</p>
        </div>
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {t("demo.menu")}
          </p>
          <ul className="grid gap-1.5 text-sm">
            {MENU.map(([name, price]) => (
              <li key={name} className="flex justify-between border-b border-dashed pb-1.5">
                <span>{name}</span>
                <span className="font-semibold">{price}</span>
              </li>
            ))}
          </ul>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-whatsapp px-3 py-1.5 text-xs font-semibold text-white">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {t("demo.order")}
          </span>
        </div>
        <figcaption className="border-t bg-secondary/60 px-5 py-2 text-xs text-muted-foreground">
          ✓ {t("demo.ready")}
        </figcaption>
      </div>
    </figure>
  );
}
