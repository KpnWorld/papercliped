import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

/** WAI-ARIA tabs: arrow keys move between tabs, Home/End jump, the panel follows. */
export function Tabs({ tabs, label }: { tabs: { id: string; label: string; content: ReactNode }[]; label: string }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setActive(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") move(active + 1);
    else if (e.key === "ArrowLeft") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(tabs.length - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div className="my-4">
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" id={`${base}-tab-${t.id}`} aria-selected={i === active} aria-controls={`${base}-panel-${t.id}`} tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", i === active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={i !== active} tabIndex={0} className="pt-3">
          {t.content}
        </div>
      ))}
    </div>
  );
}
