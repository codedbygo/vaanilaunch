import supported from "./supported.json";

// The 9 languages of the whole app: the page text, the microphone and the agent's replies all
// follow the one the owner picks. Code is a BCP 47 tag the Web Speech API also accepts.
export const LANGS = [
  { code: "te-IN", native: "తెలుగు", english: "Telugu" },
  { code: "hi-IN", native: "हिन्दी", english: "Hindi" },
  { code: "ta-IN", native: "தமிழ்", english: "Tamil" },
  { code: "kn-IN", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml-IN", native: "മലയാളം", english: "Malayalam" },
  { code: "mr-IN", native: "मराठी", english: "Marathi" },
  { code: "bn-IN", native: "বাংলা", english: "Bengali" },
  { code: "gu-IN", native: "ગુજરાતી", english: "Gujarati" },
  { code: "en-IN", native: "English", english: "English" },
] as const;

export type LangCode = (typeof LANGS)[number]["code"];

export const DEFAULT_LOCALE: LangCode = "en-IN";

/** The declared list (supported.json) is the contract the i18n check reads; LANGS must match it. */
export const SUPPORTED: readonly string[] = supported;

export const isLang = (v: string): v is LangCode => LANGS.some((l) => l.code === v);

export const langOf = (code: LangCode) => LANGS.find((l) => l.code === code) ?? LANGS[0];

/** One tag through the fallback chain: exact ("hi-IN"), then its language ("hi" → "hi-IN"). */
function match(tag: string): LangCode | undefined {
  if (isLang(tag)) return tag;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return LANGS.find((l) => l.code.split("-")[0] === base)?.code;
}

/**
 * Which language to show. (a) A saved choice wins; one we no longer support falls to the default,
 * never to the browser, because the owner chose. (b) With no saved choice, the browser's
 * languages in order. (c) The default.
 */
export function resolveLocale(saved: string | null, browser: readonly string[]): LangCode {
  if (saved) return match(saved) ?? DEFAULT_LOCALE;
  for (const tag of browser) {
    const hit = match(tag);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}
