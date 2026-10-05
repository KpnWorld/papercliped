# Changelog

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
