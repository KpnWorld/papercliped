# Domains and hosts (papercliped.co)

One bridge service answers every host; it routes by the `Host` header. Nothing here needs a second server.

| Host | What it serves |
| --- | --- |
| `papercliped.co` | The website (landing, status, changelog, community, brand, privacy, terms), `/manage`, and every API |
| `www.papercliped.co` | Redirects to `papercliped.co` (same path) |
| `docs.papercliped.co` | The docs at `/topics` and `/topics/<page>`; `/` and old `/docs/...` paths redirect there |
| `mcp.papercliped.co`, `api.papercliped.co` | MCP, OAuth, ChatGPT Actions, `/openapi.json` and `/api/public/v1/*`; web pages redirect to `papercliped.co` |
| `forum.papercliped.co` | Redirects to the forum (`FORUM_URL`; GitHub Discussions to start, see `docs/COMMUNITY.md`) |

Every host also answers the protocol and API paths (`/mcp`, `/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/*`, `/actions/*`, `/openapi.json`, `/api/*`, `/manage`, `/healthz`, `/readyz`), so nothing breaks if an app or person uses another host for them.

## 1. Cloudflare DNS
In Cloudflare → `papercliped.co` → **DNS → Records**, add (Render shows the exact target, `<service>.onrender.com`):

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` | `<service>.onrender.com` | DNS only |
| CNAME | `www` | `<service>.onrender.com` | DNS only |
| CNAME | `docs` | `<service>.onrender.com` | DNS only |
| CNAME | `mcp` | `<service>.onrender.com` | DNS only |
| CNAME | `api` | `<service>.onrender.com` | DNS only |
| CNAME | `forum` | `<service>.onrender.com` | DNS only |

Start with **DNS only (grey cloud)** so Render can issue certificates. SSL/TLS mode: **Full (strict)**. If you later turn on proxying (orange cloud), set `BRIDGE_PROXY_HOPS=2` and keep challenges off the API paths (`docs/LAUNCH.md` §3C).

## 2. Render
Render → the service → **Settings → Custom Domains → Add** each of: `papercliped.co`, `www.papercliped.co`, `docs.papercliped.co`, `mcp.papercliped.co`, `api.papercliped.co`, `forum.papercliped.co`. Click **Verify** on each and wait for the certificates.

## 3. Environment (Render → Environment)
```
PUBLIC_HOSTS=marketing=papercliped.co,www.papercliped.co;docs=docs.papercliped.co;api=mcp.papercliped.co,api.papercliped.co;forum=forum.papercliped.co
FORUM_URL=https://github.com/OpenSourcx/papercliped/discussions
```
The first `marketing` host is the canonical one. Hosts you don't list (like `<service>.onrender.com`) still serve the whole site, so the service stays reachable while DNS changes. The Docker image builds the website and the bridge finds it at `/app/web/dist` (override with `WEB_DIST`).

## 4. The OAuth issuer: decide once
`BRIDGE_PUBLIC_URL` is the OAuth issuer **and** the resource AI apps connect to. An app's connector URL must be `<BRIDGE_PUBLIC_URL>/mcp`; using another host's `/mcp` fails the sign-in (the token's resource wouldn't match).

- **Option A (no change, works today):** keep `BRIDGE_PUBLIC_URL=https://papercliped.co`. Connector URL: `https://papercliped.co/mcp` (what the docs say now). `mcp.`/`api.` serve the public API and OpenAPI; their `/mcp` is not used for sign-in.
- **Option B (cleaner split):** set `BRIDGE_PUBLIC_URL=https://mcp.papercliped.co`. Connector URL becomes `https://mcp.papercliped.co/mcp`.

**Changing `BRIDGE_PUBLIC_URL` invalidates every existing token.** Everyone connected must connect again. Right now that's only the owner, so if you want option B, do it before inviting anyone, and update in the same go:
- the Claude connector (Settings → Connectors: remove, add the new URL) and Claude Code (`claude mcp add --transport http papercliped <new>/mcp`);
- a ChatGPT connector or GPT Action (re-import `<new>/openapi.json`);
- the Paperclip plugin's **Papercliped bridge URL** setting (the plugin talks to `/api/manage` and `/api/public`, which work on any host, so it only matters if you want it on the new host);
- the docs and website text that show `https://papercliped.co/mcp` (`site/docs/*.md` use `{{URL}}/mcp`; the website's landing page and kit have it written out).

## 5. Check
```
curl -sI https://www.papercliped.co/status         # 301 → https://papercliped.co/status
curl -sI https://docs.papercliped.co/              # 301 → /topics
curl -sI https://papercliped.co/docs/permissions   # 301 → https://docs.papercliped.co/topics/permissions
curl -s  https://api.papercliped.co/api/public/v1/status
curl -s  https://papercliped.co/.well-known/oauth-authorization-server | head -c 200
curl -sI https://forum.papercliped.co/             # 302 → the forum
```

## Rollback
Remove `PUBLIC_HOSTS` and redeploy: every host serves the whole site again, with docs at `/docs`. To go back to the old Markdown pages entirely, set `WEB_DIST` to a folder that doesn't exist. DNS records and Render custom domains can stay.
