import { useEffect, useRef, useState } from "react";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * The smiling paperclip. Its eyes follow the pointer and it blinks now and then; with reduced motion it stays still.
 * Colours come from the theme tokens, so it matches every palette.
 */
export function Mascot({ size = 64, title = "Papercliped mascot", interactive = true, className }: { size?: number; title?: string; interactive?: boolean; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const live = interactive && !reduced;
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!live) return setLook({ x: 0, y: 0 });
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.7);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 200);
      setLook({ x: (dx / d) * 1.4 * k, y: (dy / d) * 1.4 * k });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2500 + Math.random() * 3500);
    };
    loop();
    return () => clearTimeout(t);
  }, [live]);

  const eye = (cx: number) => (
    <g>
      <circle cx={cx} cy={44.5} r={4} fill="var(--surface)" />
      {blink ? <rect x={cx - 3.2} y={44} width={6.4} height={1.2} rx={0.6} fill="var(--ink)" /> : <circle cx={cx + 0.8 + look.x} cy={45.2 + look.y} r={2} fill="var(--ink)" />}
    </g>
  );
  return (
    <svg ref={ref} {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })} viewBox="0 0 64 64" width={size} height={size} className={className} data-blink={blink || undefined}>
      <rect width="64" height="64" rx="16" fill="var(--surface)" stroke="var(--line)" />
      <path d="M22 38V19a10 10 0 0 1 20 0v24a14 14 0 0 1-28 0V24" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      {eye(26.5)}
      {eye(37.5)}
      <path d="M28.5 52q3.5 3 7 0" fill="none" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="21.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85" />
      <circle cx="42.5" cy="50" r="2.2" fill="#e98a7a" opacity=".85" />
    </svg>
  );
}
