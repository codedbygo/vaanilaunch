import { Check, Mic } from "lucide-react";

const LINES = [
  ["GoDaddy", "lakshmitiffins.in available · ₹799/yr"],
  ["Claude vision", "3 photos → 3 products in తెలుగు + English"],
  ["You", "Approved on the phone preview"],
  ["GoDaddy DNS", "lakshmi.vaanilaunch.in → live, HTTPS ✓"],
] as const;

// A five-second story of the product: a voice note becomes a live store. Decorative.
export function HeroDemo() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 hidden rounded-3xl border border-white/15 bg-white/5 p-5 shadow-2xl backdrop-blur-sm lg:block"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-foreground">
        <span className="grid size-11 flex-none place-items-center rounded-full bg-brand text-white">
          <Mic className="size-5" />
        </span>
        <div>
          <b className="block text-sm">“నేను విజయవాడలో ఇడ్లీ, దోశ పిండి, పచ్చళ్ళు అమ్ముతాను”</b>
          <small className="text-xs text-muted-foreground">
            I sell idli and dosa batter and pickles in Vijayawada
          </small>
        </div>
      </div>
      <ul className="my-4 grid gap-2.5">
        {LINES.map(([by, text], i) => (
          <li
            key={by}
            className="relative grid animate-rise gap-0.5 rounded-xl bg-white/5 py-2.5 pr-3 pl-10 text-sm text-night-foreground"
            style={{ animationDelay: `${String(0.8 + i * 0.9)}s` }}
          >
            <span className="absolute top-3 left-3 grid size-4.5 place-items-center rounded-full bg-success text-white">
              <Check className="size-3" />
            </span>
            <span className="text-xs font-bold tracking-wider text-saffron uppercase">{by}</span>
            {text}
          </li>
        ))}
      </ul>
      <div
        className="animate-rise rounded-xl bg-success/15 p-2.5 text-center font-extrabold text-success"
        style={{ animationDelay: "4.6s" }}
      >
        ● Live in 2:41 · first order received
      </div>
    </div>
  );
}
