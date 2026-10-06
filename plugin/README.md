# papercliped-paperclip-plugin

Papercliped inside Paperclip: a sidebar entry and page to link your Papercliped account and manage the AI apps connected to your Paperclip.

> **Beta, not yet run in a live Paperclip.** Unit-tested against a fake bridge and the SDK test harness only.

## Install
From **Settings → Plugins** in Paperclip, install the npm package `papercliped-paperclip-plugin` (instance admin only). Capabilities requested: `plugin.state.read`, `plugin.state.write`, `http.outbound`, `ui.sidebar.register`, `ui.page.register`.

Config: **Papercliped bridge URL** (default `https://papercliped.kpnsolute.com`, must be https).

## Use
1. At your bridge's `/manage` page (beta account) click **Link Paperclip plugin** and copy the one-time code.
2. In Paperclip open **Papercliped** and paste it under **Link account**.

## How it works
- The page calls plugin **actions** (`status`, `link`, `connections`, `setLevel`, `disconnect`, `privacy`, `unlink`). Actions receive the host-verified `actor.userId`; the bridge token is stored in plugin state keyed by a hash of that id and is never returned to the page.
- The worker calls the bridge's `/api/manage` with `Authorization: Bearer pcb_pl_…`. That token has no scopes: it cannot call Paperclip tools, mint link codes, or do secret-key actions.
- Plugin UI and worker are trusted, same-origin code in Paperclip; install only from the official package.

## Develop
```sh
npm install
npm run typecheck && npm test
npm run build     # worker, manifest and UI bundles in dist/
```
Layout: `src/bridge.ts` (bridge client), `src/keys.ts` (per-user state keys), `src/handlers.ts` (action logic), `src/worker.ts`, `src/manifest.ts`, `src/ui/index.tsx`.
