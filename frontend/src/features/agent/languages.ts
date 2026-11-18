import { DEFAULT_LOCALE, translate, type LangCode, type MessageKey } from "@/lib/i18n";

// The language list lives with the rest of i18n: one choice drives the page, the mic and the agent.
export { LANGS, isLang, langOf, type LangCode } from "@/lib/i18n";

/** Tap-to-send example messages, shown in the owner's language. */
export const EXAMPLES = {
  launch: ["examples.launch.1", "examples.launch.2", "examples.launch.3"],
  // Quick changes for a store that exists; they go through the same voice-edit engine.
  manage: [
    "edits.premium",
    "edits.cream",
    "edits.heading",
    "edits.hours",
    "examples.manage.1",
    "examples.manage.2",
    "examples.manage.3",
  ],
} satisfies Record<string, MessageKey[]>;

const SPEECH_ERRORS = {
  "not-allowed": "speech.error.not-allowed",
  "service-not-allowed": "speech.error.service-not-allowed",
  "audio-capture": "speech.error.audio-capture",
  "language-not-supported": "speech.error.language-not-supported",
  network: "speech.error.network",
} satisfies Record<string, MessageKey>;

const isKnown = (code: string): code is keyof typeof SPEECH_ERRORS => code in SPEECH_ERRORS;

export const speechError = (code: string, locale: LangCode = DEFAULT_LOCALE) =>
  isKnown(code)
    ? translate(locale, SPEECH_ERRORS[code])
    : translate(locale, "speech.error.unknown", { code });
