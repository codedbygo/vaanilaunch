import { cn } from "@/lib/utils";

const BARS = [
  { x: 3, y: 9, h: 6 },
  { x: 7, y: 5, h: 14 },
  { x: 11, y: 2, h: 20 },
  { x: 15, y: 6, h: 12 },
  { x: 19, y: 10, h: 4 },
];

/** The VaaniLaunch sound-wave mark. */
export function Wave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 fill-saffron", className)}>
      {BARS.map((b) => (
        <rect key={b.x} x={b.x} y={b.y} width="2.4" height={b.h} rx="1.2" />
      ))}
    </svg>
  );
}
