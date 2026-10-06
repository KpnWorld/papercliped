# Changelog

## v1.1.0-beta.2 — connection manager, public site

- **Beta connection manager** at `/manage` and a management API (`/api/manage/*`): sign in with username + secret key, see every connected app, switch it between Read only and Full control (beta) with immediate effect, disconnect it, toggle anonymity, make a new secret key, disconnect your Paperclip, delete your account. Sensitive actions re-ask for the secret key; Admin is never grantable from here. Opt in with **Join the beta** on the permission screen (migration `005_beta.sql`, applied automatically).
- **Full control (beta)** is offered to everyone on the permission screen; Admin only when the app asks for it.
- **Public site** served by the bridge: an interactive landing page ("Papercliped, not Paperclipped."), live user count, docs (getting started, create your account, permissions, anonymous mode, manage connections, security, ChatGPT, troubleshooting), privacy and terms. A new smiling-paperclip favicon on every page.
- Windows-friendly test suite; `npm publish` only builds.
- Set `SITE_CONTACT` (an email or support URL) so the privacy and terms pages show a real contact.

Not in this release: a native Paperclip plugin that embeds the manager inside Paperclip (it needs the Paperclip plugin SDK).

## v1.0.0-beta.1 — first public beta

Papercliped connects Claude and ChatGPT to your own Paperclip: control agents, sync state, pull reports.

- **MCP server** (stdio + Streamable HTTP) and **ChatGPT Actions** (generated OpenAPI) over Paperclip's REST API.
- **Hosted multi-tenant bridge** with its own OAuth 2.1 server (DCR, PKCE, rotating refresh tokens, scopes read/control/admin).
- **Papercliped accounts**: choose a unique username (6–32 chars, at least one number or `. # _`) and get a secret key. Sign in with the key, or reconnect by approving in your Paperclip — you keep your account and a live connection.
- **Anonymous mode**: show as an alias (e.g. `Ann02`) in logs and the operator panel.
- **SSRF-hardened egress** for user-supplied Paperclip URLs; sealed (AES-256-GCM) stored credentials with key rotation.
- **Operator panel — a separate program** (`papercliped-panel`) reading a read-only database role: latency, system faults, success rate, user count, and the community log (`09:25:30 og.kpnwrld - joined cliped`).
- Free-tier friendly: keep-alive worker, database heartbeat, auto-migrate; one-paste Supabase schema (`docs/supabase-schema.sql`).

Known limits: not yet validated against live Render / Supabase / claude.ai / ChatGPT; code has not had an independent security audit. See `docs/SECURITY.md`.
