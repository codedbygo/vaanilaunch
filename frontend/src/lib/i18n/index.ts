import { create } from "zustand";

import bn from "./catalogs/bn-IN.json";
import en from "./catalogs/en-IN.json";
import gu from "./catalogs/gu-IN.json";
import hi from "./catalogs/hi-IN.json";
import kn from "./catalogs/kn-IN.json";
import ml from "./catalogs/ml-IN.json";
import mr from "./catalogs/mr-IN.json";
import ta from "./catalogs/ta-IN.json";
import te from "./catalogs/te-IN.json";
import { resolveLocale, type LangCode } from "./locales";

export * from "./locales";

/** Every key the app may look up; the English catalog is the source of truth. */
export type MessageKey = keyof typeof en;
type PluralBase<K> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;
export type Vars = Record<string, string | number>;
type Catalog = Partial<Record<MessageKey, string>>;

// ponytail: all 9 catalogs ship in the bundle (about 120 kB, 25 kB gzipped); split per language
// with dynamic import if the bundle budget ever needs it.
const CATALOGS: Record<LangCode, Catalog> = {
  "en-IN": en,
  "te-IN": te,
  "hi-IN": hi,
  "ta-IN": ta,
  "kn-IN": kn,
  "ml-IN": ml,
  "mr-IN": mr,
  "bn-IN": bn,
  "gu-IN": gu,
};

/** For keys built from data (a tool name from the server): only known keys are looked up. */
export const isMessageKey = (key: string): key is MessageKey => key in en;

/** A key missing from a catalog shows the English text, never the key or a blank. */
export function lookup(catalog: Catalog, key: MessageKey): string {
  return catalog[key] ?? en[key];
}

export function translate(locale: LangCode, key: MessageKey, vars?: Vars): string {
  const text = lookup(CATALOGS[locale], key);
  return vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => String(vars[name] ?? all)) : text;
}

/** A count message: picks the CLDR plural category ("one", "other") for this language. */
export function translatePlural(locale: LangCode, key: PluralKey, count: number): string {
  const cat = new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
  return translate(locale, `${key}.${cat}` as MessageKey, { count });
}

// The owner's language choice. Client-only state, saved on this device.
const STORAGE_KEY = "vl_lang";

function saved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function apply(locale: LangCode) {
  // The document language drives screen-reader pronunciation and the browser's font choice.
  document.documentElement.lang = locale;
}

interface LocaleState {
  locale: LangCode;
  setLocale: (locale: LangCode) => void;
}

export const useLocaleStore = create<LocaleState>()((set) => {
  const initial = resolveLocale(saved(), navigator.languages);
  apply(initial);
  return {
    locale: initial,
    setLocale: (locale) => {
      try {
        localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // private mode or blocked storage: the choice still holds for this tab
      }
      apply(locale);
      set({ locale });
    },
  };
});

/** Current language plus lookups bound to it; re-renders the component when it changes. */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return {
    locale,
    t: (key: MessageKey, vars?: Vars) => translate(locale, key, vars),
  };
}
