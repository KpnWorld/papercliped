export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function ago(ms: number | null) {
  if (!ms) return "never";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
export const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}`);
export const LEVEL = { "paperclip:read": "Read only", "paperclip:control": "Full control" } as Record<string, string>;
