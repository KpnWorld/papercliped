# Architecture, auth and distribution plan

Status: research + recommendation (Oct 2026). Sources: Paperclip source/docs (`paperclipai/paperclip`, read at depth‑1 clone) and Anthropic's connector/plugin docs. Items marked **[unverified]** are inferences or come from secondary sources and need testing before we rely on them.

## 1. Verdict: integrate, don't rebuild

Keep Paperclip as the system of record and build *around* it. Rebuilding is not justified:

- Paperclip is a large, active codebase (8k+ files, ~295 DB migrations, adapters for ~10 agent runtimes, governance, budgets, approvals, MCP gateway, plugin SDK). Our goals — control, sync, reports, API use — are all reachable through its existing REST API. Nothing we need requires different core semantics.
- A fork forfeits upstream fixes and the Paperclip community's agents/templates (ClipHub). A rebuild would cost far more than the integration gaps below.
- The real gaps are **auth scoping** and **transport/OAuth**, and both can be solved in a front layer or contributed upstream.

## 2. What Paperclip gives us (relevant facts)

| Area | Fact | Consequence |
| --- | --- | --- |
| API | REST under `/api`; company-scoped; JSON; errors `{error}` | Our bridge is a thin client — no DB access, no business logic |
| Auth modes | `local_trusted` (no login, loopback) · `authenticated/private` · `authenticated/public` (Better Auth sessions) | Bridge must work with no token (local) and with a token (everything else) |
| Operator creds | **Board API keys** (`board_api_keys`: hashed, `expiresAt`, `revokedAt`, `lastUsedAt`, bound to a *user*). **No scope or company column** | A board key = that user's full board power. Never hand one to a public third party |
| Login for tools | CLI challenge flow: client creates a challenge → user approves at `approvalUrl` in Paperclip's UI → client polls and receives a board token | Reusable as our "Sign in with Paperclip" step (no passwords touch our code) |
| Agent creds | Agent keys / run JWTs; pause, resume, approve etc. are **board‑only** | Operator control must use board creds (documented in README) |
| OAuth | Paperclip is an OAuth **client** (to upstream MCP servers). It is **not** an authorization server | claude.ai / ChatGPT connectors can't authenticate to Paperclip directly |
| MCP | Official `@paperclipai/mcp-server` is a stdio wrapper for use inside agent runs. "Gateway mode" is agent→upstream, with profiles/policies/audit. No operator‑facing remote `/mcp` | Our bridge is the missing operator-side endpoint |
| Plugins | Real plugin runtime: manifest + worker + UI; capability‑gated worker APIs; `apiRoutes` mounted only at `/api/plugins/:id/api/*`; plugins are trusted code; capability additions → `upgrade_pending` until an operator approves; install by npm/local path/image catalog (`paperclipai plugin install`). **No public plugin marketplace** (ClipHub = company templates only) | A native plugin is possible but distribution is operator‑installed, not store‑based |

## 3. How public plugins actually ship (Claude & ChatGPT)

**Claude** (docs.claude.com connector + plugin docs):
- **Plugin bundle** (skills, commands, local MCP server like ours): public GitHub repo with `.claude-plugin/plugin.json`, README, LICENSE → `claude plugin validate` → submit at `claude.ai/directory/manage` ("Plugin bundle") → automated validation + security scan, sometimes human review → publish; later versions follow the tracked branch/tag. Data‑handling questions at submit time. Org can also share privately via a git marketplace (`/plugin marketplace add owner/repo`) — works today.
- **Remote MCP connector** (what claude.ai web/mobile/Desktop use): must be HTTPS. Auth = OAuth 2.0 (DCR or Client‑ID‑Metadata‑Document, PKCE S256, `401` + `WWW-Authenticate: Bearer resource_metadata=…`, RFC 9728 protected‑resource metadata, RFC 8414 AS metadata, form‑encoded `/token`, refresh rotation, 10 s endpoint latency), or none, or a **static header credential (beta, limited orgs)**. Callbacks: `https://claude.ai/api/mcp/auth_callback` and a port‑agnostic loopback for Claude Code. Every tool needs `title` + `readOnlyHint`/`destructiveHint` (we already set these). Reviewers need a populated test account. Custom (unlisted) connectors can be added by URL by any user/org without review.
- Plugins that reference a remote server should submit that server as a connector too.

**ChatGPT** **[unverified: from secondary sources; I could not fetch OpenAI's docs]**:
- *Apps SDK / MCP apps*: streamable‑HTTP MCP + OAuth 2.1 (DCR, PKCE); public submission needs a verified OpenAI org, public ToS + privacy policy, support contact, demo video, test account and test cases.
- *Custom GPT Actions*: OpenAPI + API‑key or OAuth; shareable via link or GPT Store. This is what we ship today (bearer key).

## 4. Auth design for public use

Problem: board keys are all‑powerful, and the connector UIs want OAuth. Solution: put an **OAuth 2.1 authorization server inside the bridge** that fronts Paperclip.

```
claude.ai / ChatGPT ──OAuth 2.1 + PKCE──▶ bridge (AS + resource server) ──board token──▶ Paperclip /api
                                              │
   /authorize ──▶ create Paperclip CLI-auth challenge ──▶ user approves in Paperclip UI
                  (bridge receives board token, stores it encrypted, mints its OWN scoped token)
```

- **Sign‑in:** reuse Paperclip's challenge/approve flow, so users authenticate to *their* Paperclip, not to us.
- **Scopes enforced by the bridge** (Paperclip can't): `paperclip:read` (reports, sync, lists) · `paperclip:control` (pause/resume/wake, issues, comments, goals) · `paperclip:admin` (terminate, approvals, budgets, raw non‑GET). Default consent = read. The bridge already classifies tools `read|write|destructive`; map those to scopes.
- **Tokens:** short‑lived access JWT (audience = bridge URL), rotating refresh tokens, per‑user revocation (and revoke the Paperclip key on disconnect via `auth revoke-current`). Tokens bound to one company if the user picks one at consent.
- **Registration:** support CIMD first (no client sprawl), DCR as fallback.
- **Endpoints to add:** `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/register`, `/authorize`, `/token`, `/revoke`; `401` challenge on `/mcp`.
- **Multi‑tenancy:** every Paperclip instance has its own URL. Options: (a) *self‑hosted bridge per operator* (their own domain) — add as a **custom connector by URL**, no directory needed; (b) *one hosted multi‑tenant bridge* where the user supplies their instance URL at consent (needs SSRF‑safe URL validation + Claude "URL pattern"/custom‑connection mode, which takes longer to review); (c) *Paperclip Cloud* — a fixed URL pattern per stack, the cleanest directory story but needs Paperclip's cooperation.
- Keep `BRIDGE_TOKEN` bearer mode for Claude Code headers, ChatGPT Actions, and the `static_headers` beta.

## 5. Phased plan

| Phase | Deliver | Ship channel | Status |
| --- | --- | --- | --- |
| 1 | stdio MCP + Claude Code plugin + Actions bridge, read‑only mode, confirm gates | git marketplace now; npm publish; submit **Plugin bundle** to Anthropic's directory | **Done** (needs live-instance test, then submit) |
| 2 | OAuth 2.1 AS in the bridge (§4), scopes, token store, audit log | custom connector by URL on claude.ai; ChatGPT app (dev mode → submission) | **Done** (self-hosted; DCR only; see `docs/oauth.md`). Untested against real claude.ai/ChatGPT clients |
| 3 | Upstream: (i) PR/issue for **scoped board API keys**; (ii) optional Paperclip‑native plugin hosting the MCP endpoint behind Paperclip's own session auth | `paperclipai plugin install`; image catalog (`distribution/catalog.json`) | Later |

Phase 3(ii) caveat **[unverified]**: plugin routes live only under `/api/plugins/:id/api/*` and can't claim root paths, while OAuth discovery wants `/.well-known/*` at the origin root (Claude lets the `401` point `resource_metadata` anywhere, but AS metadata must be at the issuer's well‑known path). A reverse‑proxy rule or a core change would be needed — test before committing to it.

## 6. Risks and open questions

1. **Never run against a live Paperclip yet.** Do that first, read‑only, then submit.
2. A hosted bridge holds users' board credentials: needs encryption at rest, a security review, a privacy policy and incident process. Prefer self‑hosting until then.
3. Prompt injection: issue/comment text from agents flows into the chat model. The skill tells Claude to treat it as data; consider output‑length and tag‑stripping limits.
4. Paperclip's API is alpha and changes fast; pin tested versions and add a contract test against a real instance in CI.
5. Directory policies and review criteria change; re‑read before each submission.
