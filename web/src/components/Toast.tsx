import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string };
const Ctx = createContext<(text: string) => void>(() => {});

/** Small polite notifications, announced to screen readers through a live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="animate-toast-in pointer-events-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-lg">{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
