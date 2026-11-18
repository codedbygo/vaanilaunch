const COLORS = [
  "bg-saffron",
  "bg-rose",
  "bg-success",
  "bg-godaddy",
  "bg-warning",
  "bg-accent-foreground",
];
// Sixty pieces: the six colours repeated ten times.
const PIECES = Array.from({ length: 10 }).flatMap(() => COLORS);

// Sixty falling pieces. Position, delay and speed vary per piece, so they are inline styles.
export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-60 overflow-hidden" aria-hidden="true">
      {PIECES.map((color, i) => (
        <i
          key={i}
          className={`absolute -top-3 h-4 w-2.5 animate-fall rounded-xs ${color}`}
          style={{
            left: `${String((i * 37) % 100)}%`,
            animationDelay: `${String((i % 12) * 0.12)}s`,
            animationDuration: `${String(2.4 + (i % 5) * 0.4)}s`,
          }}
        />
      ))}
    </div>
  );
}
