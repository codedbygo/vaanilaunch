import {
  Calculator,
  CheckCircle2,
  Globe,
  KeyRound,
  Languages,
  Mic,
  PenLine,
  Rocket,
  Smartphone,
  Sparkles,
  Wallet,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

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
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-8 sm:pt-28">
      <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 mb-10 max-w-2xl text-lg text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

function Icon({ icon: I }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 place-items-center rounded-xl border bg-card text-saffron">
      <I className="size-5" aria-hidden="true" />
    </span>
  );
}

const HOW = [
  [Mic, "speak"],
  [Sparkles, "build"],
  [Rocket, "publish"],
] as const;

export function HowItWorks() {
  const { t } = useT();
  return (
    <Section id="how" title={t("how.title")} sub={t("how.sub")}>
      <ol className="grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
        {HOW.map(([icon, id], i) => (
          <li key={id} className="bg-card p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <Icon icon={icon} />
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-semibold">{t(`how.${id}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`how.${id}.text`)}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const FEATURES = [
  [Mic, "voice"],
  [Languages, "languages"],
  [PenLine, "content"],
  [Wand2, "edit"],
  [Smartphone, "mobile"],
  [Globe, "publish"],
] as const;

export function Features() {
  const { t } = useT();
  return (
    <Section id="features" title={t("features.title")} sub={t("features.sub")}>
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([icon, id]) => (
          <div key={id}>
            <Icon icon={icon} />
            <h3 className="mt-4 font-semibold">{t(`features.${id}.title`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(`features.${id}.text`)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const TRUST = [
  [CheckCircle2, "approve"],
  [Wallet, "payments"],
  [Calculator, "totals"],
  [KeyRound, "key"],
] as const;

export function Trust() {
  const { t } = useT();
  return (
    <Section id="trust" title={t("trust.title")} sub={t("trust.sub")}>
      <div className="grid gap-4 md:grid-cols-2">
        {TRUST.map(([icon, id]) => (
          <div key={id} className="flex items-start gap-4 rounded-2xl border bg-card p-5">
            <Icon icon={icon} />
            <div>
              <h3 className="font-semibold">{t(`trust.${id}.title`)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t(`trust.${id}.text`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function FinalCta({ onStart }: { onStart: () => void }) {
  const { t } = useT();
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-8 sm:pt-28">
      <div className="rounded-3xl bg-night px-6 py-14 text-center text-white sm:px-12">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("cta.title")}
        </h2>
        <Button
          onClick={onStart}
          size="lg"
          className="mt-8 h-12 rounded-full bg-saffron px-7 text-base font-semibold text-white hover:bg-saffron/90"
        >
          <Mic aria-hidden="true" /> {t("cta.button")}
        </Button>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useT();
  const product: [string, string][] = [
    ["#how", t("nav.how")],
    ["#features", t("nav.features")],
    ["#trust", t("nav.trust")],
  ];
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-[2fr_1fr_1fr] sm:px-8">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <Wave className="size-5" /> VaaniLaunch
          </div>
          <p className="mt-3 max-w-xs text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <h3 className="font-semibold">{t("footer.product")}</h3>
          <ul className="mt-3 grid gap-2">
            {product.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-muted-foreground no-underline hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">{t("footer.contact")}</h3>
          <ul className="mt-3 grid gap-2">
            <li>
              <a
                href="#contact"
                className="text-muted-foreground no-underline hover:text-foreground"
              >
                {t("footer.talk")}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
