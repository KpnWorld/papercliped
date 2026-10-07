# Working on Papercliped

Papercliped connects AI apps (Claude, ChatGPT, Codex, any MCP client) to a Paperclip instance. This file is read by Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`); keep the two identical.

## Every push is a release

Use the **release** skill (`.claude/skills/release/SKILL.md`, `.agents/skills/release/SKILL.md`) before every push to `main`: pick Major.Minor.Patch, add the user-facing entry under `## Unreleased` in `CHANGELOG.md`, run `node scripts/version.mjs <major|minor|patch> "<title>"`, and write the commit description as the release note. CI publishes to npm, tags the commit and creates the GitHub release.

## Map

| Path | What |
| --- | --- |
| `src/` | The bridge: MCP + HTTP server, OAuth (`src/oauth/`), tools (`src/tools.ts`), manage API (`src/manage/`), public API, website serving (`src/web/`) |
| `plugin/` | Papercliped plugin for Paperclip (own package; Node 24.11+) |
| `web/` | Website and docs site (React + Tailwind, Vite) |
| `site/docs/` | User docs in Markdown (rendered by the website and the bridge) |
| `migrations/` | Postgres schema; regenerate `docs/supabase-schema.sql` with `npm run schema:sql` |
| `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`, `.mcp.json`, `skills/`, `commands/` | The Claude Code and Codex plugins and marketplaces |

## Checks

```sh
npm run typecheck && npm test                     # bridge (Postgres tests need TEST_DATABASE_URL)
npm --prefix plugin run typecheck && npm --prefix plugin test && npm --prefix plugin run build
npm --prefix web test && npm --prefix web run build && npm --prefix web run check:routes
node scripts/check-packages.mjs                    # after building root and plugin
node scripts/version.mjs check
```

## Rules

- Never commit secrets. Never weaken a security check, test or the website's CSP (`script-src 'self'; style-src 'self'`, no inline code, no third-party loads, no analytics) to make something pass.
- Access levels are exactly two: Read only (`paperclip:read`) and Full control (`paperclip:control`, every tool).
- The public stats API is aggregate-only; it never exposes identities.
- Community links stay empty until the real accounts exist; don't invent handles.
- Domain: papercliped.co (site), docs.papercliped.co (docs at `/<page>`), mcp.papercliped.co (connector `/mcp`).
- Don't put AI model names in commits, code or docs.
