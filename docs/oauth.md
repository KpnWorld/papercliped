# OAuth (Phase 2): connect claude.ai, Claude Desktop/mobile and ChatGPT apps

With `BRIDGE_OAUTH=1` the bridge is an OAuth 2.1 authorization server **and** the protected resource (`/mcp`). Clients discover it, register themselves, and send the user through a consent page. The user signs in with **Paperclip's own approval flow**, so the bridge never handles their password.

```
client ──401 + resource_metadata──▶ bridge /mcp
client ──DCR /register──────────────▶ bridge
client ──/authorize (PKCE S256)─────▶ bridge ──create challenge──▶ Paperclip /api/cli-auth/challenges
user   ── opens approvalUrl, signs in to Paperclip, approves ─────▶ Paperclip
user   ── picks Read / Control / Admin, presses Allow ───────────▶ bridge (verifies approval, checks token)
client ──/token (code + verifier)───▶ bridge ──▶ opaque access + rotating refresh token
client ──/mcp  Bearer pcb_at_…──────▶ bridge ──user's board token──▶ Paperclip
```

## Setup (self-hosted)

```sh
export PAPERCLIP_API_URL=http://localhost:3100
export PAPERCLIP_PUBLIC_URL=https://paperclip.example.com   # where the USER's browser reaches Paperclip
export BRIDGE_OAUTH=1
export BRIDGE_PUBLIC_URL=https://bridge.example.com          # https origin, no path
export BRIDGE_SECRET=$(openssl rand -hex 32)                 # keep it; losing/rotating it disconnects everyone
export BRIDGE_DATA_FILE=/var/lib/paperclip-bridge/state.json # omit = memory only (restart disconnects everyone)
npm run start:http                                           # put TLS in front (Caddy / Cloudflare Tunnel / …)
```

- **claude.ai / Desktop / mobile:** Settings → Connectors → *Add custom connector* → `https://bridge.example.com/mcp`. Leave client ID/secret empty (Claude registers itself). Allow Anthropic's egress range `160.79.104.0/21` if you firewall.
- **Claude Code:** `claude mcp add --transport http paperclip https://bridge.example.com/mcp`, then `/mcp` to sign in. (Or keep using stdio.)
- **ChatGPT MCP app (developer mode):** point at the same `/mcp` URL. **[unverified]** ChatGPT's redirect hosts are in the default allow-list from secondary sources; if sign-in is refused with "redirect host … not allowed", add the host to `BRIDGE_OAUTH_REDIRECT_HOSTS`.
- **Instances without the approval flow** (or `local_trusted` with remote clients): `BRIDGE_LOGIN=static` + `BRIDGE_TOKEN`. The consent page then asks the operator for `BRIDGE_TOKEN` and the bridge uses `PAPERCLIP_API_KEY` for upstream calls. Everyone who connects shares that one Paperclip identity.

## Scopes (enforced by the bridge — Paperclip's keys have none)

| Scope | Allows |
| --- | --- |
| `paperclip:read` | lists, reports, sync, raw GET |
| `paperclip:control` | + pause/resume/wake/clear-error, create/update issues & goals, comments |
| `paperclip:admin` | + decide approvals, set budgets, terminate agents, raw non-GET |

Each includes the lower ones. The user picks a level on the consent page (never above what the client asked for; admin is never preselected). Tools above the grant aren't even advertised to the model, and a call is refused with `403 insufficient_scope`.
**What scopes do not do:** limit *which company* or agent a grant can touch. The underlying Paperclip board key is user-wide, and the bridge cannot tell which company an agent/issue id belongs to. Per-company scoping needs scoped board keys upstream (Phase 3).

## Security properties (each covered by a test in `test/oauth.test.ts`)

- PKCE `S256` mandatory; single-use 60 s codes; **code replay revokes the tokens it produced**; `client_id`/`redirect_uri` re-checked at exchange.
- Never redirects to an unregistered `redirect_uri`; registration only accepts allow-listed https hosts + loopback (port-agnostic per RFC 8252); public clients only.
- Opaque tokens, only SHA-256 hashes stored; refresh tokens rotate and **reuse revokes the whole grant** and the Paperclip key (`revoke-current`).
- The Paperclip credential is sealed with AES-256-GCM (key derived from `BRIDGE_SECRET`) and deleted on revoke; it is never returned to any client.
- Consent page: CSRF token, CSP (`frame-ancestors 'none'`), escaped client names, loopback warning, rate limits on authorize/decision/token/register and on admin-token guesses.
- Every tool call is audit-logged as a JSON line (tool, mutation, ok/status, grant id, client name, Paperclip user id) — never tokens or arguments.
- Access tokens last 1 h, refresh 30 d (sliding). Operators can revoke a grant via `OAuthProvider.revokeGrant`; users via the client's "disconnect" (`/revoke`).

## Hosting, Postgres and FastAPI

You run the bridge; nothing about it needs me (or Anthropic) to host it, and a Claude Code session's container is ephemeral. Options:

- **Single node (today):** this Node service + `BRIDGE_DATA_FILE` on a persistent volume (Fly, Railway, Render, a VPS). Fine for a team's self-hosted instance. Limits: one process (the consent state and rate limiter live in memory) and a JSON file as the store.
- **Postgres:** the right store once you want more than one process, backups, or a hosted multi-tenant bridge. `OAuthStore` is the only persistence boundary (clients, grants, token hashes); a `PgStore` with the same methods is a small change and I'd move the pending-consent map, auth codes and rate limiter there (or to Redis) at the same time. Keep the credential **sealed in the app** before it reaches the database, ideally with a KMS-held key rather than `BRIDGE_SECRET`.
- **FastAPI:** possible, but it means rewriting the OAuth server and MCP layer in Python (the official Python MCP SDK exists), duplicating the tested logic here for no functional gain. I'd keep Node unless you have a Python-only constraint or want to share code with a Python backend. A Python service that only *manages* grants (admin UI, billing) next to this bridge is a reasonable split.
- **Hosted for other people's Paperclip instances:** do not do this casually. You'd be storing board credentials for strangers. It needs per-tenant instance URLs with SSRF-safe validation, KMS envelope encryption, a security review, a privacy policy and an incident process. See `docs/ARCHITECTURE.md` §4–6.

## Not implemented yet

CIMD (Client ID Metadata Documents; needs SSRF-safe fetching), per-company scoping, multi-process deployment, an admin UI for listing/revoking grants, and Anthropic-held client credentials. DCR is the only registration path, so very busy public deployments will accumulate registered clients (idle ones are pruned after 7 days; capped at 1000).
