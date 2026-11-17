/** 161000 → "2:41" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/** 1234.5 → "₹1,234.5" */
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
