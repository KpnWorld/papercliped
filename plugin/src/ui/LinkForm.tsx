import { useState, type FormEvent } from "react";
import { errText } from "./format.js";
import { field, h2, muted, panel, primary, row } from "./look.js";

/** Link this Paperclip user to their Papercliped account: username + secret key, checked once by the bridge, never stored. */
export function LinkForm({ expired, onLink }: { expired: boolean; onLink: (username: string, secret: string) => Promise<unknown> }) {
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    onLink(username.trim(), secret.trim())
      .then(() => setSecret(""))
      .catch((err) => setMsg(errText(err)))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} style={panel} aria-labelledby="pcl-link-h">
      <h2 id="pcl-link-h" style={h2}>Link your Papercliped account</h2>
      {expired && <p role="status" style={muted}>Your link ended (for example after a new secret key). Sign in again to link.</p>}
      <p style={muted}>Use the username and secret key you got when you first connected Claude or ChatGPT. Papercliped checks the key once; it is not stored in Paperclip.</p>
      <div style={{ ...row, marginTop: 10 }}>
        <input aria-label="Username" name="papercliped-username" style={{ ...field, flex: "1 1 160px" }} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="off" spellCheck={false} />
        <input aria-label="Secret key" name="papercliped-secret-key" type="password" style={{ ...field, flex: "2 1 220px" }} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="pcs_XXXX-XXXX-XXXX-XXXX" autoComplete="new-password" spellCheck={false} />
        <button type="submit" style={primary} disabled={busy || !username.trim() || !secret.trim()}>{busy ? "Linking…" : "Link"}</button>
      </div>
      {msg && <p role="alert" style={{ margin: "10px 0 0" }}>{msg}</p>}
      <p style={{ ...muted, marginTop: 12 }}>Lost your key? Connect from your AI app again and choose <strong>Connect your Paperclip</strong>: you keep your account and get a new key.</p>
    </form>
  );
}
