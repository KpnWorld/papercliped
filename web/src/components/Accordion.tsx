import type { ReactNode } from "react";

/** Native <details> so it works with keyboard, screen readers and find-in-page without any script. */
export function Accordion({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {items.map((it) => (
        <details key={it.q} className="group px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {it.q}
            <span aria-hidden="true" className="transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="pt-2 text-muted">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
