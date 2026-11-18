import { Languages, Menu, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useStores } from "@/features/stores/hooks";
import { isLang, LANGS, useLocaleStore, useT, type MessageKey } from "@/lib/i18n";

import { Wave } from "./Wave";

/** Each language in its own script, so someone who can't read English can still find hers. */
function LanguagePicker() {
  const { t, locale } = useT();
  const setLocale = useLocaleStore((s) => s.setLocale);
  return (
    <label className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm hover:bg-secondary">
      <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          if (isLang(e.target.value)) setLocale(e.target.value);
        }}
        className="cursor-pointer bg-transparent font-medium outline-none"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Nav({ onStart }: { onStart: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // Examples link only when real stores exist: the gallery hides itself otherwise.
  const hasExamples = (useStores().data?.length ?? 0) > 0;
  const links: [string, MessageKey][] = [
    ["#how", "nav.how"],
    ["#features", "nav.features"],
    ...(hasExamples ? [["#stores", "nav.examples"] as [string, MessageKey]] : []),
    ["#trust", "nav.trust"],
  ];
  const linkList = (className: string) =>
    links.map(([href, key]) => (
      <a
        key={href}
        href={href}
        className={className}
        onClick={() => {
          setOpen(false);
        }}
      >
        {t(key)}
      </a>
    ));

  return (
    <nav
      aria-label={t("nav.label")}
      className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <a href="#top" className="flex items-center gap-2 text-lg font-bold no-underline">
          <Wave />
          <span>VaaniLaunch</span>
        </a>
        <div className="hidden items-center gap-7 lg:flex">
          {linkList("text-sm text-muted-foreground no-underline hover:text-foreground")}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguagePicker />
          <Button
            onClick={onStart}
            className="hidden rounded-full px-4 font-semibold sm:inline-flex"
          >
            {t("nav.cta")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t("nav.menu")}
            aria-expanded={open}
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="grid gap-1 border-t px-4 py-3 lg:hidden">
          {linkList("rounded-lg px-2 py-2 text-sm no-underline hover:bg-secondary")}
          <Button
            onClick={() => {
              setOpen(false);
              onStart();
            }}
            className="mt-2 rounded-full font-semibold sm:hidden"
          >
            {t("nav.cta")}
          </Button>
        </div>
      )}
    </nav>
  );
}
