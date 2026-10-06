import { useCallback, useEffect, useState } from "react";
import { copyTextToClipboard, DataTable, KeyValueList, StatusBadge, usePluginToast, type DataTableColumn } from "@paperclipai/plugin-sdk/ui";
import { Confirm } from "./Confirm.js";
import { ago, errText, LEVEL } from "./format.js";
import { button, code, danger, field, h2, muted, panel, row, tab, tabs } from "./look.js";
import type { Call, Conn, Link, Me } from "./types.js";

type Tab = "apps" | "privacy" | "links" | "account";
const TABS: { id: Tab; label: string }[] = [
  { id: "apps", label: "Connected apps" },
  { id: "privacy", label: "Privacy" },
  { id: "links", label: "Linked Paperclips" },
  { id: "account", label: "Account" },
];

/** Everything a linked person can manage, in four tabs. */
export function Dashboard({ me, call, onUnlinked, onMe }: { me: Me; call: Call; onUnlinked: () => void; onMe: (m: Me) => void }) {
  const [t, setT] = useState<Tab>("apps");
  return (
    <div>
      <section aria-label="Your account" style={panel}>
        <KeyValueList
          pairs={[
            { label: "Signed in as", value: <strong>{me.name}</strong> },
            { label: "Paperclip", value: me.paperclip ?? "—" },
            { label: "Paperclip key", value: me.connected ? <StatusBadge label="Connected" status="ok" /> : <StatusBadge label="Not connected: connect again from your AI app" status="warning" /> },
            { label: "In the logs", value: me.anonymous && me.alias ? `Anonymous (as ${me.alias})` : "Your username" },
          ]}
        />
      </section>
      <div role="tablist" aria-label="Papercliped" style={tabs}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" id={`pcl-tab-${x.id}`} aria-selected={t === x.id} aria-controls={`pcl-panel-${x.id}`} style={tab(t === x.id)} onClick={() => setT(x.id)}>{x.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`pcl-panel-${t}`} aria-labelledby={`pcl-tab-${t}`}>
        {t === "apps" && <Apps call={call} />}
        {t === "privacy" && <Privacy me={me} call={call} onMe={onMe} />}
        {t === "links" && <Links call={call} onUnlinked={onUnlinked} />}
        {t === "account" && <Account call={call} onUnlinked={onUnlinked} />}
      </div>
    </div>
  );
}

function Apps({ call }: { call: Call }) {
  const toast = usePluginToast();
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const load = useCallback(() => {
    call.connections().then((r) => setConns((r as { connections: Conn[] }).connections)).catch((e) => toast({ title: "Could not load your apps", body: errText(e), tone: "error" }));
  }, [call, toast]);
  useEffect(load, [load]);
  const run = (p: Promise<unknown>, title: string) => p.then(() => { toast({ title, tone: "success" }); load(); }).catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }));

  const columns: DataTableColumn<Conn>[] = [
    { key: "app", header: "App", render: (v) => <strong>{String(v)}</strong> },
    {
      key: "level", header: "Can do",
      render: (v, c) => (
        <select aria-label={`Access level for ${c.app}`} style={field} value={v === "paperclip:read" ? "read" : "control"}
          onChange={(e) => run(call.setLevel({ id: c.id, level: e.target.value }), `${c.app} is now ${e.target.value === "read" ? "Read only" : "Full control"}`)}>
          <option value="read">Read only</option>
          <option value="control">Full control</option>
        </select>
      ),
    },
    { key: "lastUsedAt", header: "Last used", render: (v) => ago(v as number | null) },
    { key: "createdAt", header: "Connected", render: (v) => ago(v as number) },
    {
      key: "id", header: "",
      render: (_v, c) => confirming === c.id
        ? <span style={row}><button type="button" style={danger} onClick={() => { setConfirming(null); run(call.disconnect({ id: c.id }), `${c.app} disconnected`); }}>Disconnect {c.app}</button><button type="button" style={button} onClick={() => setConfirming(null)}>Keep</button></span>
        : <button type="button" style={button} onClick={() => setConfirming(c.id)}>Disconnect</button>,
    },
  ];
  return (
    <section style={{ marginTop: 12 }}>
      <p style={muted}><strong>Read only</strong> can look at agents, issues, goals, costs and reports. <strong>Full control</strong> can use every tool, including pausing or terminating agents, approvals and budgets. Changes apply on the app's next request.</p>
      <DataTable columns={columns as unknown as DataTableColumn[]} rows={(conns ?? []) as unknown as Record<string, unknown>[]} loading={conns == null} emptyMessage="No apps connected. Add Papercliped as a connector in Claude or ChatGPT." />
    </section>
  );
}

function Privacy({ me, call, onMe }: { me: Me; call: Call; onMe: (m: Me) => void }) {
  const toast = usePluginToast();
  const [busy, setBusy] = useState(false);
  const set = (anonymous: boolean) => {
    setBusy(true);
    call.privacy({ anonymous })
      .then((r) => {
        const x = r as { anonymous: boolean; alias: string | null };
        onMe({ ...me, anonymous: x.anonymous, alias: x.alias });
        toast({ title: x.anonymous ? `You now appear as ${x.alias}` : "You now appear by your username", tone: "success" });
      })
      .catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))
      .finally(() => setBusy(false));
  };
  return (
    <section style={panel}>
      <h2 style={h2}>Appear anonymously</h2>
      <p style={muted}>The service's logs and operator dashboard show an alias instead of your username. Your connections keep working either way.</p>
      <label style={{ ...row, marginTop: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={me.anonymous} disabled={busy} onChange={(e) => set(e.target.checked)} />
        <span>{me.anonymous ? `On${me.alias ? `: you appear as ${me.alias}` : ""}` : "Off"}</span>
      </label>
    </section>
  );
}

function Links({ call, onUnlinked }: { call: Call; onUnlinked: () => void }) {
  const toast = usePluginToast();
  const [links, setLinks] = useState<Link[] | null>(null);
  const load = useCallback(() => {
    call.links().then((r) => setLinks((r as { links: Link[] }).links)).catch((e) => toast({ title: "Could not load your links", body: errText(e), tone: "error" }));
  }, [call, toast]);
  useEffect(load, [load]);
  const columns: DataTableColumn<Link>[] = [
    { key: "host", header: "Paperclip", render: (v, l) => <span><strong>{String(v ?? "Paperclip")}</strong>{l.current && <> <StatusBadge label="This one" status="info" /></>}</span> },
    { key: "lastUsedAt", header: "Last used", render: (v) => ago(v as number | null) },
    { key: "createdAt", header: "Linked", render: (v) => ago(v as number) },
    {
      key: "id", header: "",
      render: (_v, l) => l.current
        ? <button type="button" style={button} onClick={() => call.unlink().then(onUnlinked).catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))}>Unlink</button>
        : <button type="button" style={button} onClick={() => call.removeLink({ id: l.id }).then(() => { toast({ title: "Link removed", tone: "success" }); load(); }).catch((e) => toast({ title: "That didn't work", body: errText(e), tone: "error" }))}>Remove</button>,
    },
  ];
  return (
    <section style={{ marginTop: 12 }}>
      <p style={muted}>Every Paperclip where you linked this account. Unlinking removes the token here and revokes it at Papercliped; your account and apps are not touched.</p>
      <DataTable columns={columns as unknown as DataTableColumn[]} rows={(links ?? []) as unknown as Record<string, unknown>[]} loading={links == null} emptyMessage="No linked Paperclips." />
    </section>
  );
}

function Account({ call, onUnlinked }: { call: Call; onUnlinked: () => void }) {
  const toast = usePluginToast();
  const [fresh, setFresh] = useState<string | null>(null);
  return (
    <section style={{ marginTop: 12 }}>
      <p style={muted}>These ask for your secret key every time.</p>
      {fresh && (
        <div role="status" style={panel}>
          <strong>Your new secret key (shown once)</strong>
          <p style={{ ...row, margin: "8px 0" }}>
            <code style={code}>{fresh}</code>
            <button type="button" style={button} onClick={() => { copyTextToClipboard(fresh); toast({ title: "Copied", tone: "success" }); }}>Copy</button>
          </p>
          <p style={muted}>Save it in your password manager now. The old key no longer works, and other linked Paperclips have to link again. This one stays linked.</p>
          <button type="button" style={button} onClick={() => setFresh(null)}>I saved it</button>
        </div>
      )}
      <Confirm label="Make a new secret key" detail="Use this if your key may have leaked. Every other linked Paperclip is unlinked." onRun={(secret) => call.rotateSecret({ secret }).then((r) => setFresh((r as { secret: string }).secret))} />
      <Confirm label="Disconnect my Paperclip" destructive detail="Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every connected app stops working and this page unlinks. Your account stays." onRun={(secret) => call.disconnectPaperclip({ secret }).then(() => { toast({ title: "Paperclip disconnected", tone: "success" }); onUnlinked(); })} />
      <Confirm label="Delete my account" destructive needName detail="Removes your username, stored key and every connection. This can't be undone." onRun={(secret, confirm) => call.deleteAccount({ secret, confirm }).then(() => { toast({ title: "Account deleted", tone: "success" }); onUnlinked(); })} />
    </section>
  );
}
