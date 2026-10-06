import { useState } from "react";
import { cx } from "./cx";

/** A code sample with a copy button. Copying falls back to selecting the text when the clipboard API isn't available. */
export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <div className={cx("group relative my-4 rounded-xl border border-line bg-surface", className)}>
      {label && <div className="border-b border-line px-4 py-1.5 text-xs font-medium text-muted">{label}</div>}
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-sm leading-6"><code>{code}</code></pre>
      <button type="button" onClick={copy} className={cx("absolute right-2 rounded-md border border-field bg-bg px-2 py-1 text-xs font-medium text-ink", label ? "top-10" : "top-2")}>
        {state === "copied" ? "Copied" : state === "failed" ? "Select & copy" : "Copy"}
      </button>
      <span className="sr-only" role="status">{state === "copied" ? "Copied to clipboard" : ""}</span>
    </div>
  );
}
