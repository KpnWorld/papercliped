import { useState } from "react";
import { errText } from "./format.js";
import { button, danger, field, muted, panel, row } from "./look.js";

/** A sensitive account action: opens inline, asks for the secret key (and the username to delete), then runs. */
export function Confirm({ label, detail, needName, destructive, onRun }: { label: string; detail: string; needName?: boolean; destructive?: boolean; onRun: (secret: string, name: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setSecret("");
    setName("");
    setMsg(null);
  };
  return (
    <div style={{ ...panel, margin: "8px 0" }}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 260px" }}>
          <strong>{label}</strong>
          <p style={muted}>{detail}</p>
        </div>
        {!open && <button type="button" style={destructive ? danger : button} onClick={() => setOpen(true)}>{label}</button>}
      </div>
      {open && (
        <form
          style={{ ...row, marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            onRun(secret.trim(), name.trim()).then(close).catch((err) => setMsg(errText(err))).finally(() => setBusy(false));
          }}
        >
          <input aria-label={`Secret key to confirm: ${label}`} type="password" autoFocus style={{ ...field, flex: "2 1 220px" }} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Your secret key" autoComplete="current-password" />
          {needName && <input aria-label="Type your username to confirm" style={{ ...field, flex: "1 1 160px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your username" autoComplete="off" />}
          <button type="submit" style={destructive ? danger : button} disabled={busy || !secret.trim() || (!!needName && !name.trim())}>{busy ? "Working…" : "Confirm"}</button>
          <button type="button" style={button} onClick={close}>Cancel</button>
          {msg && <p role="alert" style={{ width: "100%", margin: "6px 0 0" }}>{msg}</p>}
        </form>
      )}
    </div>
  );
}
