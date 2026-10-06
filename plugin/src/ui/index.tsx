import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary, Spinner, useHostNavigation, usePluginAction, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Dashboard } from "./Dashboard.js";
import { errText } from "./format.js";
import { LinkForm } from "./LinkForm.js";
import { muted, panel } from "./look.js";
import { ServicePanel } from "./Service.js";
import type { Call, Status } from "./types.js";

export function PapercliedSidebar() {
  const nav = useHostNavigation();
  return <a {...nav.linkProps("/papercliped")} style={{ display: "block", padding: "6px 12px", color: "inherit", textDecoration: "none" }}>Papercliped</a>;
}

/** The Papercliped page inside Paperclip: link your account, then manage connected apps, privacy, links and your account. */
export function PapercliedPage() {
  return (
    <ErrorBoundary fallback={<p role="alert" style={{ padding: 24 }}>Something went wrong on this page. Reload to try again.</p>}>
      <Page />
    </ErrorBoundary>
  );
}

function useCalls(): Call {
  const a = {
    status: usePluginAction("status"), link: usePluginAction("link"), connections: usePluginAction("connections"),
    setLevel: usePluginAction("setLevel"), disconnect: usePluginAction("disconnect"), privacy: usePluginAction("privacy"),
    links: usePluginAction("links"), removeLink: usePluginAction("removeLink"), unlink: usePluginAction("unlink"),
    rotateSecret: usePluginAction("rotateSecret"), disconnectPaperclip: usePluginAction("disconnectPaperclip"), deleteAccount: usePluginAction("deleteAccount"),
    serviceStatus: usePluginAction("serviceStatus"),
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => a, Object.values(a));
}

function Page() {
  const call = useCalls();
  const toast = usePluginToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    call.status().then((s) => { setStatus(s as Status); setError(null); }).catch((e) => setError(errText(e)));
  }, [call]);
  useEffect(refresh, [refresh]);
  const loadService = useCallback(() => call.serviceStatus(), [call]);

  return (
    <div style={{ maxWidth: 880, padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 4px" }}>Papercliped</h1>
      <p style={{ ...muted, margin: "0 0 8px" }}>Your Papercliped account, inside Paperclip: the AI apps connected to your Paperclip, what each may do, and your account.</p>
      <ServicePanel load={loadService} />
      {error && <div role="alert" style={panel}>{error} <button type="button" onClick={refresh} style={{ font: "inherit", color: "inherit", background: "none", border: 0, textDecoration: "underline", cursor: "pointer" }}>Try again</button></div>}
      {!status && !error && <Spinner label="Loading Papercliped" />}
      {status && !status.linked && (
        <LinkForm expired={!!status.expired} onLink={(username, secret) => call.link({ username, secret, instanceHost: window.location.host }).then((r) => { setStatus(r as Status); toast({ title: "Linked", tone: "success" }); })} />
      )}
      {status && status.linked && <Dashboard me={status.me} call={call} onUnlinked={refresh} onMe={(me) => setStatus({ linked: true, me })} />}
    </div>
  );
}
