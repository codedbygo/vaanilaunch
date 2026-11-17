// The 9 languages the owner can speak. Code is the Web Speech API locale.
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

export const langOf = (code: LangCode) => LANGS.find((l) => l.code === code) ?? LANGS[0];

export const EXAMPLES = {
  launch: [
    "నేను విజయవాడలో ఇంటి నుండి టిఫిన్ సర్వీస్ నడుపుతాను. ఇడ్లీ, దోశ పిండి, పచ్చళ్ళు అమ్ముతాను",
    "मैं जयपुर में घर से ब्लाउज़ सिलाई का काम करती हूँ",
    "I bake custom cakes and cookies from home in Pune",
  ],
  manage: ["Add Sunday special biryani for ₹180", "Show my orders", "We are closed this Sunday"],
};

const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone permission was blocked. Click the lock icon in the address bar, allow the microphone, then try again.",
  "service-not-allowed":
    "This browser doesn't allow voice input. Open the app in Google Chrome or Microsoft Edge.",
  "audio-capture":
    "No microphone was found. Check that a mic is connected and selected in your system sound settings.",
  "language-not-supported":
    "This browser can't recognise that language. Try Google Chrome, or pick another language.",
  network:
    "Voice couldn't reach Google's speech service. Use Google Chrome or Edge (VS Code's browser and Chromium can't), and check your internet.",
};

export const speechError = (code: string) =>
  SPEECH_ERRORS[code] ?? `Voice input stopped (${code}). Try Google Chrome, or type instead.`;
