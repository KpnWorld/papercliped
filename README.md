# papercliped — Claude & ChatGPT plugin for Paperclip

Drive a [Paperclip](https://github.com/paperclipai/paperclip) instance (AI-agent company orchestrator) from Claude or ChatGPT through Paperclip's REST API.

| Goal | How |
| --- | --- |
| Control Paperclip and agents | pause / resume / wake / clear-error / terminate agents, set budgets, create & assign issues, manage goals, decide approvals |
| Sync with agents | `paperclip_sync_snapshot` (state now), `paperclip_sync_changes` (cursor-based "what changed"), `paperclip_wait_for_agent` (follow a run to completion) |
| Reports | status, costs, agent performance, activity digest — markdown for people plus structured data |
| Use the API | every tool is a thin call to Paperclip's `/api`; `paperclip_api_request` reaches anything without a dedicated tool |

One tool catalogue (`src/tools.ts`, 30 tools) feeds three surfaces, so they cannot drift:

```
Claude Code / Claude Desktop ──stdio──▶ ┐
Any MCP client ──Streamable HTTP /mcp─▶ ├─ tools ─▶ Paperclip /api
ChatGPT Custom GPT ──/actions/* + /openapi.json─▶ ┘
```

> Paperclip already ships `@paperclipai/mcp-server` for issues/goals/approvals *from inside an agent run*. This bridge is the **operator-side** complement: agent lifecycle control, dashboard/cost/activity reports, sync, and an HTTP transport. They can be installed side by side.

## Two plugins, one service

| | **Papercliped for AI apps** (the main one) | **Papercliped plugin for Paperclip** (beta) |
| --- | --- | --- |
| What | Lets Claude, ChatGPT or any MCP client control and report on your Paperclip | A page inside your Paperclip to link your Papercliped account and manage connected AI apps |
| Where it runs | Hosted at `https://papercliped.co` (connector URL `https://mcp.papercliped.co/mcp`), or self-hosted / local (this repo, npm `papercliped`) | Inside Paperclip, installed by the instance admin (npm `papercliped-paperclip-plugin`, source in `plugin/`) |
| Docs | [Getting started](site/docs/getting-started.md), [any AI app](site/docs/other-ai-apps.md), [ChatGPT](docs/chatgpt.md) | [Paperclip plugin](site/docs/paperclip-plugin.md), [plugin/README.md](plugin/README.md) |

Papercliped is free and open source (MIT). The hosted service at `https://papercliped.co` runs this code.

## Install

```sh
git clone https://github.com/OpenSourcx/papercliped && cd papercliped
npm install        # also builds (prepare script)
npm test
```

### Credentials (read this first)

Pause/resume/wake/approve are **board-only** in Paperclip, so an agent API key will get `403`s. Use a **board API token**:

```sh
paperclipai auth login      # then copy the board token, or use your instance's token flow
export PAPERCLIP_API_URL=http://localhost:3100
export PAPERCLIP_API_KEY=<board token>      # not needed in local_trusted mode
export PAPERCLIP_COMPANY_ID=<optional default company>
export PAPERCLIP_READ_ONLY=1                # optional: reports + sync only, no writes
```

## Claude Code (plugin)

```
/plugin marketplace add OpenSourcx/papercliped
/plugin install papercliped@papercliped
```

You get the MCP tools, a `paperclip` skill (sync-first workflow + confirm-before-destructive rules) and `/paperclip-status`, `/paperclip-sync`, `/paperclip-report`.
The env vars above are read from your shell. Or without the plugin: `claude mcp add paperclip -- node /path/to/papercliped/dist/stdio.js`.

## Claude Desktop

```json
{ "mcpServers": { "paperclip": {
  "command": "node", "args": ["/path/to/papercliped/dist/stdio.js"],
  "env": { "PAPERCLIP_API_URL": "http://localhost:3100", "PAPERCLIP_API_KEY": "…" } } } }
```

## ChatGPT (Custom GPT Actions)

Run the HTTP bridge somewhere ChatGPT can reach over HTTPS, then import its OpenAPI. Step-by-step: [docs/chatgpt.md](docs/chatgpt.md).

```sh
export BRIDGE_TOKEN=$(openssl rand -hex 32)     # required; the bridge refuses to start without it
export BRIDGE_PUBLIC_URL=https://bridge.example.com
npm run start:http                               # 127.0.0.1:3939 — put TLS in front (Caddy, Cloudflare Tunnel, …)
```

Endpoints (all but `/healthz`, `/openapi.json` and the OAuth endpoints need `Authorization: Bearer <BRIDGE_TOKEN or OAuth access token>`): `POST /mcp` (MCP Streamable HTTP, stateless), `POST /actions/{tool}` (JSON in/out), `GET /openapi.json`. With `BRIDGE_OAUTH=1`: `/.well-known/oauth-*`, `/register`, `/authorize`, `/token`, `/revoke`.

### Three ways to run it

| Mode | For | Auth | State |
| --- | --- | --- | --- |
| **stdio** (`node dist/stdio.js`) | you, on your machine (Claude Code/Desktop) | your env vars | none |
| **HTTP + `BRIDGE_TOKEN`** | ChatGPT Actions, Claude Code headers, one instance | static bearer | none |
| **HTTP + OAuth, `BRIDGE_MODE=single`** | a team fronting *their one* Paperclip | OAuth 2.1, scoped | JSON file or Postgres |
| **HTTP + OAuth, `BRIDGE_MODE=multi`** | **a public service**: every user connects their own (publicly reachable, https) Paperclip | OAuth 2.1, scoped | Postgres (required) |

**Public stats API** (no sign-in): `GET /api/public/v1/stats|status|series|errors|info` gives aggregate users, connections, sign-in success, request success rate, latency, error mix and load, with no identities or per-user data; see the [public API docs](site/docs/public-api.md). The operator dashboard lives in a separate, access-controlled service. **Supabase schema:** paste [docs/supabase-schema.sql](docs/supabase-schema.sql) into the SQL editor. **Launch guide (Render free, domain, marketplaces, npm):** [docs/LAUNCH.md](docs/LAUNCH.md).

Public hosting on Render + Supabase: **[docs/DEPLOY-RENDER.md](docs/DEPLOY-RENDER.md)** · threat model and residual risks: **[docs/SECURITY.md](docs/SECURITY.md)** · policy templates: [docs/legal/](docs/legal/).

### Connect claude.ai / Claude Desktop / ChatGPT apps (OAuth)

Set `BRIDGE_OAUTH=1`, `BRIDGE_PUBLIC_URL`, `BRIDGE_SECRET`, `BRIDGE_DATA_FILE` (see [.env.example](.env.example)), then add `https://<your bridge>/mcp` as a custom connector. Users sign in through Paperclip's own approval page and choose Read / Control / Admin. Full guide, scopes and security model: [docs/oauth.md](docs/oauth.md).

## Safety model

- OAuth connections get scoped tokens (Read only or Full control), enforced in the bridge, with every call audit-logged. See [docs/oauth.md](docs/oauth.md).
- `PAPERCLIP_READ_ONLY=1` blocks every mutating tool (and non-GET `paperclip_api_request`) before anything is sent to Paperclip.
- `paperclip_terminate_agent` needs `confirm: true`; non-GET raw API calls need it too. Tools carry MCP `destructiveHint`/`readOnlyHint`, and OpenAPI `x-openai-isConsequential`, so clients prompt before consequential calls.
- The HTTP bridge binds to loopback by default, uses constant-time token comparison, caps bodies at 1 MB, and times out upstream calls (30 s).
- The bridge holds a powerful credential. Anyone with `BRIDGE_TOKEN` controls your agents; scope the Paperclip token and use read-only mode where you can.

## Known limits — please read

- **Tested against a mock of Paperclip's documented API, not a live instance.** Endpoint paths and fields were taken from Paperclip's docs and server source (`docs/api/*`, `server/src/routes/*`); report/sync code reads response fields defensively. Run it against your instance with `PAPERCLIP_READ_ONLY=1` first.
- **claude.ai web / Desktop / mobile connectors and ChatGPT MCP apps** need OAuth: set `BRIDGE_OAUTH=1` (see [docs/oauth.md](docs/oauth.md)). OAuth scopes limit *what* a connection may do, not *which company* it may touch (Paperclip board keys are user-wide; verified in its source). Not yet implemented: CIMD. Users manage their own connections at `/manage` (beta); operators use `npm run admin`.
- **A public bridge holds other people's Paperclip keys.** A bridge compromise exposes all of them until revoked. Read [docs/SECURITY.md](docs/SECURITY.md) before opening it up. The code is unaudited and the Render/Supabase/claude.ai/ChatGPT specifics are untested against the live services.
- **Hosted mode only reaches Paperclips on the public internet over https.** `localhost`/private-network instances use the local stdio plugin.
- `paperclip_sync_changes` polls the activity log (no push). Activity has no server-side `since` filter, so it fetches up to `limit` recent entries and filters locally; raise `limit` if you poll infrequently on a busy company.
- ChatGPT Actions allow ~30 operations per GPT; the catalogue is at 30, the limit. Adding tools means removing some for that surface.

## Layout

```
src/tools.ts      tool catalogue (schemas + Paperclip calls)     src/reports.ts  report builders
src/execute.ts    validation, read-only enforcement, errors      src/openapi.ts  OpenAPI from the catalogue
src/mcp.ts        MCP server    src/stdio.ts   src/server.ts + http.ts  HTTP bridge
src/oauth/        OAuth 2.1 server: provider, stores (memory/JSON + Postgres), crypto/key ring, scopes, consent pages, Paperclip login adapter
src/telemetry/    audit events, batching recorder, system sampler, timing   src/public-api/  public aggregate stats API (types, routes, health)
src/net/          SSRF-safe fetch + instance URL validation (multi-tenant egress guard)
migrations/       Postgres schema (dedicated `bridge` schema, RLS)   Dockerfile   container image (Render free web service)   src/cli.ts  admin CLI
.claude-plugin/ .mcp.json skills/ commands/    Claude Code plugin
src/manage/       beta connection manager (/manage, /api/manage)   plugin/  Paperclip plugin (own package.json, tests and build)
site/             public pages (markdown) served by the bridge   web/  new website (React + Tailwind, in progress)   .github/workflows/  CI, CodeQL, release (npm trusted publishing)
test/             end-to-end tests against a mock Paperclip
```

## Paperclip plugin (beta)

`plugin/` is a Paperclip plugin (`papercliped-paperclip-plugin`, built on `@paperclipai/plugin-sdk`) that adds a **Papercliped** page inside Paperclip to link your account and manage connected apps. Docs: [site/docs/paperclip-plugin.md](site/docs/paperclip-plugin.md), [plugin/README.md](plugin/README.md). It has not yet been run in a live Paperclip.

## Docs map

[Site map of every page](docs/SITEMAP.md) · [Releasing](docs/RELEASING.md) · [Security model](docs/SECURITY.md) · [v2 plan: managed subdomains](docs/V3-SUBDOMAINS.md) · [Contributing](CONTRIBUTING.md)

## Privacy

Local modes: no telemetry and no backend; the bridge sends requests only to the Paperclip instance you configure and returns responses to the AI client that called it. Your credential lives in environment variables on your machine. Hosted mode (OAuth) additionally stores, per connection, an encrypted Paperclip key, hashed tokens and an audit log — see [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md) (template) and [docs/SECURITY.md](docs/SECURITY.md). Data you expose to Claude or ChatGPT is then subject to that provider's own terms and privacy policy. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security model and distribution plan.
