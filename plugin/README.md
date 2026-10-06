# papercliped-paperclip-plugin

Papercliped inside Paperclip: a sidebar entry and page to link your Papercliped account and manage the AI apps connected to your Paperclip.

> **Not yet run in a live Paperclip.** Unit-tested against a fake bridge and the SDK test harness only.

## Install
From **Settings → Plugins** in Paperclip, install the npm package `papercliped-paperclip-plugin` (instance admin only). Capabilities requested: `plugin.state.read`, `plugin.state.write`, `http.outbound`, `ui.sidebar.register`, `ui.page.register`.

Config: **Papercliped bridge URL** (default `https://papercliped.co`, must be https).

## Use
1. In Paperclip open **Papercliped** in the sidebar.
2. Enter your Papercliped username and secret key and click **Link** (the key is checked once by the bridge and not stored).

Then manage connected apps (level, disconnect), privacy, linked Paperclips, and your account (new secret key, disconnect Paperclip, delete account; these ask for the secret key again).

## How it works
- The page calls plugin **actions** (`status`, `link`, `connections`, `setLevel`, `disconnect`, `privacy`, `links`, `removeLink`, `unlink`, `rotateSecret`, `disconnectPaperclip`, `deleteAccount`, `serviceStatus`). Actions receive the host-verified `actor.userId`; the bridge token is stored in plugin state keyed by a hash of that id and is never returned to the page.
- The worker calls the bridge's `/api/manage` with `Authorization: Bearer pcb_pl_…`. That token has no scopes: it cannot call Paperclip tools. Secret-key actions send the key in that one request; it is never stored.
- Plugin UI and worker are trusted, same-origin code in Paperclip; install only from the official package.

## Develop
```sh
npm install
npm run typecheck && npm test
npm run build     # worker, manifest and UI bundles in dist/
```
Layout: `src/bridge.ts` (bridge client), `src/keys.ts` (per-user state keys), `src/handlers.ts` (action logic), `src/worker.ts`, `src/manifest.ts`, `src/ui/index.tsx`.
