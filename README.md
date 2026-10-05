# papercliped — Claude & ChatGPT plugin for Paperclip

Drive a [Paperclip](https://github.com/paperclipai/paperclip) instance (AI-agent company orchestrator) from Claude or ChatGPT through Paperclip's REST API.

| Goal | How |
| --- | --- |
| Control Paperclip and agents | pause / resume / wake / clear-error / terminate agents, set budgets, create & assign issues, manage goals, decide approvals |
| Sync with agents | `paperclip_sync_snapshot` (state now), `paperclip_sync_changes` (cursor-based "what changed"), `paperclip_wait_for_agent` (follow a run to completion) |
| Reports | status, costs, agent performance, activity digest — markdown for people plus structured data |
| Use the API | every tool is a thin call to Paperclip's `/api`; `paperclip_api_request` reaches anything without a dedicated tool |

One tool catalogue (`src/tools.ts`, 29 tools) feeds three surfaces, so they cannot drift:

```
Claude Code / Claude Desktop ──stdio──▶ ┐
Any MCP client ──Streamable HTTP /mcp─▶ ├─ tools ─▶ Paperclip /api
ChatGPT Custom GPT ──/actions/* + /openapi.json─▶ ┘
```

> Paperclip already ships `@paperclipai/mcp-server` for issues/goals/approvals *from inside an agent run*. This bridge is the **operator-side** complement: agent lifecycle control, dashboard/cost/activity reports, sync, and an HTTP transport. They can be installed side by side.

## Install

```sh
git clone https://github.com/KpnWorld/papercliped && cd papercliped
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
/plugin marketplace add KpnWorld/papercliped
/plugin install paperclip@papercliped
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

### Connect claude.ai / Claude Desktop / ChatGPT apps (OAuth)

Set `BRIDGE_OAUTH=1`, `BRIDGE_PUBLIC_URL`, `BRIDGE_SECRET`, `BRIDGE_DATA_FILE` (see [.env.example](.env.example)), then add `https://<your bridge>/mcp` as a custom connector. Users sign in through Paperclip's own approval page and choose Read / Control / Admin. Full guide, scopes and security model: [docs/oauth.md](docs/oauth.md).

## Safety model

- OAuth connections get scoped tokens (read/control/admin), enforced in the bridge, with every call audit-logged. See [docs/oauth.md](docs/oauth.md).
- `PAPERCLIP_READ_ONLY=1` blocks every mutating tool (and non-GET `paperclip_api_request`) before anything is sent to Paperclip.
- `paperclip_terminate_agent` needs `confirm: true`; non-GET raw API calls need it too. Tools carry MCP `destructiveHint`/`readOnlyHint`, and OpenAPI `x-openai-isConsequential`, so clients prompt before consequential calls.
- The HTTP bridge binds to loopback by default, uses constant-time token comparison, caps bodies at 1 MB, and times out upstream calls (30 s).
- The bridge holds a powerful credential. Anyone with `BRIDGE_TOKEN` controls your agents; scope the Paperclip token and use read-only mode where you can.

## Known limits — please read

- **Tested against a mock of Paperclip's documented API, not a live instance.** Endpoint paths and fields were taken from Paperclip's docs and server source (`docs/api/*`, `server/src/routes/*`); report/sync code reads response fields defensively. Run it against your instance with `PAPERCLIP_READ_ONLY=1` first.
- **claude.ai web / Desktop / mobile connectors and ChatGPT MCP apps** need OAuth: set `BRIDGE_OAUTH=1` (see [docs/oauth.md](docs/oauth.md)). OAuth scopes limit *what* a connection may do, not *which company* it may touch (Paperclip board keys are user-wide). Not yet implemented: CIMD, multi-process deployment, grant admin UI.
- `paperclip_sync_changes` polls the activity log (no push). Activity has no server-side `since` filter, so it fetches up to `limit` recent entries and filters locally; raise `limit` if you poll infrequently on a busy company.
- ChatGPT Actions allow ~30 operations per GPT; the catalogue is at 29. Adding tools means removing some for that surface.

## Layout

```
src/tools.ts      tool catalogue (schemas + Paperclip calls)     src/reports.ts  report builders
src/execute.ts    validation, read-only enforcement, errors      src/openapi.ts  OpenAPI from the catalogue
src/mcp.ts        MCP server    src/stdio.ts   src/server.ts + http.ts  HTTP bridge
src/oauth/        OAuth 2.1 server: provider, store, crypto, scopes, consent pages, Paperclip login adapter
.claude-plugin/ .mcp.json skills/ commands/    Claude Code plugin
test/             end-to-end tests against a mock Paperclip
```

## Privacy

This bridge has no telemetry and no backend of its own. It sends requests only to the Paperclip instance you configure (`PAPERCLIP_API_URL`) and returns the responses to the AI client that called it. It stores nothing on disk. Your Paperclip credential lives in environment variables on the machine running the bridge. Data you expose to Claude or ChatGPT is then subject to that provider's own terms and privacy policy. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security model and distribution plan.
