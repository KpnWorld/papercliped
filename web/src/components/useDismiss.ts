import { useEffect, useRef, type RefObject } from "react";

/** Close a popover on Escape or a click outside `box`. */
export function useDismiss(open: boolean, close: () => void, box: RefObject<HTMLElement | null>) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && latest.current();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, box]);
}
