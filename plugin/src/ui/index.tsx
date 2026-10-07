import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary, Spinner, usePluginAction, usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { Dashboard } from "./Dashboard.js";
import { errText } from "./format.js";
import { LinkForm } from "./LinkForm.js";
import { muted, panel, title } from "./look.js";
import { ServicePanel } from "./Service.js";
import { PapercliedSidebar } from "./Sidebar.js";
import type { Call, Status } from "./types.js";

export { PapercliedSidebar };

/** The Papercliped page inside Paperclip: link your account, then manage connected apps, privacy, links and your account. */
export function PapercliedPage() {
  return (
    <ErrorBoundary fallback={<p role="alert" className="p-6">Something went wrong on this page. Reload to try again.</p>}>
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
    <div className="max-w-4xl p-6">
      <h1 className={title}>Papercliped</h1>
      <p className={`${muted} mb-2`}>Your Papercliped account, inside Paperclip: the AI apps connected to your Paperclip, what each may do, and your account.</p>
      <ServicePanel load={loadService} />
      {error && <div role="alert" className={panel}>{error} <button type="button" onClick={refresh} className="underline underline-offset-2 hover:text-foreground">Try again</button></div>}
      {!status && !error && <Spinner label="Loading Papercliped" />}
      {status && !status.linked && (
        <LinkForm expired={!!status.expired} onLink={(username, secret) => call.link({ username, secret, instanceHost: window.location.host }).then((r) => { setStatus(r as Status); toast({ title: "Linked", tone: "success" }); })} />
      )}
      {status && status.linked && <Dashboard me={status.me} call={call} onUnlinked={refresh} onMe={(me) => setStatus({ linked: true, me })} />}
    </div>
  );
}
