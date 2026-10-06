import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useHostNavigation, usePluginAction } from "@paperclipai/plugin-sdk/ui";

// Neutral styling on purpose: everything inherits the host's colours, fonts and borders so the page looks native.
const card: React.CSSProperties = { border: "1px solid currentColor", borderColor: "color-mix(in srgb, currentColor 22%, transparent)", borderRadius: 8, padding: "12px 14px", margin: "10px 0", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" };
const muted: React.CSSProperties = { opacity: 0.65, fontSize: 13 };
const field: React.CSSProperties = { font: "inherit", color: "inherit", background: "transparent", border: "1px solid currentColor", borderColor: "color-mix(in srgb, currentColor 30%, transparent)", borderRadius: 6, padding: "6px 10px" };
const btn: React.CSSProperties = { ...field, cursor: "pointer" };

interface Service { status: "ok" | "degraded" | "down"; version: string; users: number | null; liveConnections: number | null; requestSuccessRate: number | null; signInSuccessRate: number | null; p95Ms: number | null; statusPage: string }
const STATUS_TEXT = { ok: "All systems normal", degraded: "Degraded performance", down: "Major problem" } as const;
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);

/** The Papercliped service's public status (aggregate numbers only), from the bridge's /api/public/v1. */
function ServiceCard({ load }: { load: () => Promise<unknown> }) {
  const [s, setS] = useState<Service | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () => load().then((x) => alive && (setS(x as Service), setErr(false))).catch(() => alive && setErr(true));
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [load]);
  return (
    <section aria-label="Papercliped service" style={{ ...card, display: "block" }}>
      <strong>Papercliped service: </strong>
      {err ? <span>status unavailable</span> : !s ? <span style={muted}>checking…</span> : (
        <>
          <span>{s.status === "ok" ? "✓" : s.status === "degraded" ? "!" : "✕"} {STATUS_TEXT[s.status]}</span>
          <span style={muted}> · v{s.version} · {s.users ?? "—"} people · {s.liveConnections ?? "—"} live connections · requests {pct(s.requestSuccessRate)} ok · p95 {s.p95Ms ?? "—"} ms · </span>
          <a href={s.statusPage} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>status page</a>
        </>
      )}
    </section>
  );
}

interface Conn { id: string; app: string; level: string; createdAt: number; lastUsedAt: number | null }
interface Me { name: string; anonymous: boolean; alias: string | null; beta: boolean; paperclip: string | null; connected: boolean }
type Status = { linked: false; expired?: boolean } | { linked: true; me: Me };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
function ago(ms: number | null) {
  if (!ms) return "never";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

export function PapercliedSidebar() {
  const nav = useHostNavigation();
  return <a {...nav.linkProps("/papercliped")} style={{ display: "block", padding: "6px 12px", color: "inherit", textDecoration: "none" }}>Papercliped</a>;
}

export function PapercliedPage() {
  const call = {
    status: usePluginAction("status"), link: usePluginAction("link"), connections: usePluginAction("connections"),
    setLevel: usePluginAction("setLevel"), disconnect: usePluginAction("disconnect"), privacy: usePluginAction("privacy"), unlink: usePluginAction("unlink"),
    serviceStatus: usePluginAction("serviceStatus"),
  };
  const loadService = useCallback(() => call.serviceStatus(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    call.status().then((s) => { setStatus(s as Status); setError(null); }).catch((e) => setError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div style={{ maxWidth: 720, padding: 24 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Papercliped</h1>
      <p style={{ ...muted, margin: "0 0 16px" }}>See the AI apps connected to your Paperclip and choose what each may do.</p>
      <ServiceCard load={loadService} />
      {error && <div role="alert" style={{ ...card, display: "block" }}>{error}</div>}
      {!status && !error && <p style={muted}>Loading…</p>}
      {status && !status.linked && <LinkForm expired={!!status.expired} onLink={(code) => call.link({ code, instanceHost: window.location.host }).then(refresh)} />}
      {status && status.linked && <Linked me={status.me} call={call} onUnlinked={refresh} onMe={(me) => setStatus({ linked: true, me })} />}
    </div>
  );
}

function LinkForm({ expired, onLink }: { expired: boolean; onLink: (code: string) => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    onLink(code).catch((err) => setMsg(errText(err))).finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit}>
      <h2 style={{ fontSize: 16 }}>Link account</h2>
      {expired && <p style={muted}>Your link ended. Make a new code to link again.</p>}
      <ol style={{ ...muted, paddingLeft: 18 }}>
        <li>Open your Papercliped <code>/manage</code> page and sign in (you need to be in the beta).</li>
        <li>Click <strong>Link Paperclip plugin</strong> and copy the code.</li>
        <li>Paste it here. It works once and expires after 10 minutes.</li>
      </ol>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input aria-label="Link code" style={{ ...field, flex: 1, minWidth: 220 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="pcl_XXXXX-XXXXX" autoComplete="off" spellCheck={false} />
        <button type="submit" style={btn} disabled={busy || !code.trim()}>{busy ? "Linking…" : "Link"}</button>
      </div>
      {msg && <p role="alert">{msg}</p>}
    </form>
  );
}

function Linked({ me, call, onUnlinked, onMe }: { me: Me; call: Record<string, (p?: Record<string, unknown>) => Promise<unknown>>; onUnlinked: () => void; onMe: (m: Me) => void }) {
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    call.connections().then((r) => setConns((r as { connections: Conn[] }).connections)).catch((e) => setMsg(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);
  const run = (p: Promise<unknown>, after?: () => void) => p.then(() => { setMsg(null); after?.(); }).catch((e) => setMsg(errText(e)));

  return (
    <div>
      <p style={muted}>Linked as <strong>{me.name}</strong>{me.paperclip ? ` · Paperclip: ${me.paperclip}` : ""}{me.connected ? "" : " · connection expired"}</p>
      {!me.beta && <p role="alert">Join the beta in Papercliped to manage connections.</p>}
      {msg && <div role="alert" style={{ ...card, display: "block" }}>{msg}</div>}

      <h2 style={{ fontSize: 16 }}>Connected apps</h2>
      {conns && conns.length === 0 && <p style={muted}>No apps connected. Add Papercliped as a connector in Claude or ChatGPT.</p>}
      {(conns ?? []).map((c) => (
        <div key={c.id} style={card}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <strong>{c.app}</strong>
            <div style={muted}>Last used {ago(c.lastUsedAt)} · connected {ago(c.createdAt)}</div>
          </div>
          <select aria-label={`Access level for ${c.app}`} style={field} value={c.level === "paperclip:read" ? "read" : "control"}
            onChange={(e) => run(call.setLevel({ id: c.id, level: e.target.value }), load)}>
            <option value="read">Read only</option>
            <option value="control">Full control</option>
          </select>
          <button style={btn} onClick={() => run(call.disconnect({ id: c.id }), load)}>Disconnect</button>
        </div>
      ))}

      <h2 style={{ fontSize: 16 }}>Privacy</h2>
      <label style={card}>
        <input type="checkbox" checked={me.anonymous} onChange={(e) => run(call.privacy({ anonymous: e.target.checked }).then((r) => onMe({ ...me, ...(r as { anonymous: boolean; alias: string | null }) })))} />
        <span>Appear anonymously in the operator logs and dashboard{me.alias && me.anonymous ? ` (as ${me.alias})` : ""}.</span>
      </label>

      <h2 style={{ fontSize: 16 }}>This link</h2>
      <p style={muted}>Unlinking removes the stored token and revokes it at Papercliped. Your secret key, account and connected apps are not touched. Changing your secret key, disconnecting your Paperclip and deleting your account are done at /manage.</p>
      <button style={btn} onClick={() => run(call.unlink(), onUnlinked)}>Unlink</button>
    </div>
  );
}
