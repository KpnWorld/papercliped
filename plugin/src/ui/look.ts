import type { CSSProperties } from "react";

// Neutral on purpose: everything inherits the host's colours and fonts, and borders are a tint of the text colour, so the
// page looks native in any Paperclip theme. Status, tables and metrics use Paperclip's own components.
const tint = (n: number) => `color-mix(in srgb, currentColor ${n}%, transparent)`;
export const panel: CSSProperties = { border: `1px solid ${tint(18)}`, borderRadius: 10, padding: 16, margin: "12px 0" };
export const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };
export const muted: CSSProperties = { opacity: 0.68, fontSize: 13, margin: "4px 0" };
export const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: "0 0 8px" };
export const field: CSSProperties = { font: "inherit", color: "inherit", background: "transparent", border: `1px solid ${tint(30)}`, borderRadius: 8, padding: "7px 10px", minHeight: 34 };
export const button: CSSProperties = { ...field, cursor: "pointer", fontWeight: 500 };
export const primary: CSSProperties = { ...button, borderColor: "currentColor", fontWeight: 600 };
export const danger: CSSProperties = { ...button, borderColor: "color-mix(in srgb, #dc2626 60%, transparent)" };
export const tabs: CSSProperties = { display: "flex", gap: 4, borderBottom: `1px solid ${tint(18)}`, margin: "16px 0 4px", overflowX: "auto" };
export const tab = (on: boolean): CSSProperties => ({ font: "inherit", color: "inherit", background: "transparent", border: 0, borderBottom: `2px solid ${on ? "currentColor" : "transparent"}`, padding: "8px 12px", cursor: "pointer", opacity: on ? 1 : 0.65, fontWeight: on ? 600 : 500 });
export const code: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, padding: "2px 6px", borderRadius: 6, border: `1px solid ${tint(20)}`, userSelect: "all" };
