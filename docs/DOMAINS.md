# Domains and hosts (papercliped.co)

One bridge service answers every host; it routes by the `Host` header. Nothing here needs a second server.

| Host | What it serves |
| --- | --- |
| `papercliped.co` | The website (landing, status, changelog, community, brand, privacy, terms), `/manage`, and every API |
| `www.papercliped.co` | Redirects to `papercliped.co` (same path) |
| `docs.papercliped.co` | The docs at `/topics` and `/topics/<page>`; `/` and old `/docs/...` paths redirect there |
| `mcp.papercliped.co` | **Where AI apps connect** (`/mcp`, the OAuth issuer), ChatGPT Actions and `/openapi.json`; web pages redirect to `papercliped.co` |
| `api.papercliped.co` | `/api/public/v1/*` and `/openapi.json`; web pages redirect to `papercliped.co` |
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

## 4. The OAuth issuer: mcp.papercliped.co (decided)
`BRIDGE_PUBLIC_URL` is the OAuth issuer **and** the resource AI apps connect to, so an app's connector URL must be `<BRIDGE_PUBLIC_URL>/mcp`. Papercliped uses:
```
BRIDGE_PUBLIC_URL=https://mcp.papercliped.co
```
Connector URL: **`https://mcp.papercliped.co/mcp`** (ChatGPT Actions: `https://mcp.papercliped.co/openapi.json`). The website, docs and `/manage` stay on `papercliped.co`; the docs show the connector URL through the `{{MCP}}` placeholder.

**Changing `BRIDGE_PUBLIC_URL` invalidates every existing token**, so everyone connected must connect again (at the time of the switch, only the owner). After switching:
- Claude: Settings → Connectors → remove the old connector, add `https://mcp.papercliped.co/mcp`. Claude Code: `claude mcp remove papercliped` then `claude mcp add --transport http papercliped https://mcp.papercliped.co/mcp`.
- ChatGPT: re-add the connector, or re-import `https://mcp.papercliped.co/openapi.json` into the GPT.
- The Paperclip plugin needs nothing: it talks to `/api/manage` and `/api/public`, which work on every host (its default bridge URL stays `https://papercliped.co`).

## 5. Check
```
curl -sI https://www.papercliped.co/status         # 301 → https://papercliped.co/status
curl -sI https://docs.papercliped.co/              # 301 → /topics
curl -sI https://papercliped.co/docs/permissions   # 301 → https://docs.papercliped.co/topics/permissions
curl -s  https://api.papercliped.co/api/public/v1/status
curl -s  https://mcp.papercliped.co/.well-known/oauth-authorization-server | head -c 200   # issuer: https://mcp.papercliped.co
curl -sI https://forum.papercliped.co/             # 302 → the forum
```

## Rollback
Remove `PUBLIC_HOSTS` and redeploy: every host serves the whole site again, with docs at `/docs`. To go back to the old Markdown pages entirely, set `WEB_DIST` to a folder that doesn't exist. DNS records and Render custom domains can stay.
