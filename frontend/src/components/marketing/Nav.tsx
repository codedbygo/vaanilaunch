import { Button } from "@/components/ui/button";

import { Wave } from "./Wave";

const LINKS = [
  ["#how", "How it works"],
  ["#trust", "Trust"],
  ["#stores", "Stores"],
] as const;

export function Nav({ onStart }: { onStart: () => void }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 flex items-center justify-between bg-night/90 px-4 py-3 text-white backdrop-blur-md sm:px-12"
    >
      <a href="#top" className="flex items-center gap-2 text-xl font-semibold no-underline">
        <Wave />
        <span>
          Vaani<b className="text-brand font-extrabold">Launch</b>
        </span>
      </a>
      <div className="flex items-center gap-5">
        {LINKS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="hidden text-sm no-underline opacity-80 hover:opacity-100 md:inline"
          >
            {label}
          </a>
        ))}
        <Button
          onClick={onStart}
          className="rounded-full bg-brand px-4 font-bold text-white shadow-none"
        >
          Launch my store
        </Button>
      </div>
    </nav>
  );
}
