import { useEffect, useState } from "react";

/** The current time, ticking once a second while `running`; for the launch timer. */
export function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, [running]);
  return now;
}
