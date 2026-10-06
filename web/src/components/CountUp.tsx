import { useEffect, useState } from "react";

/** Counts up to a number once it's known; jumps straight there with reduced motion. */
export function CountUp({ value, duration = 900 }: { value: number | null; duration?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setShown(value);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{value == null ? "—" : shown.toLocaleString("en-US")}</span>;
}
