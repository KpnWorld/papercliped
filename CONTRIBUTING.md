# Contributing

## Setup
```sh
npm ci                      # root (also builds)
npm --prefix plugin ci      # the Paperclip plugin is a separate package
```
Node 22 for the root; the plugin needs Node 24.11+ (its SDK requires it). The release workflow uses Node 24. Some tests need Postgres and skip without it: set `TEST_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:5432/<db>` (the roles `bridge_app` and `panel_ro` need the same password; see `test/store.test.ts`).

## Before you open a pull request
```sh
npm run typecheck && npm test                      # root
npm --prefix plugin run typecheck && npm --prefix plugin test && npm --prefix plugin run build
npm run build && npm run schema:sql && git diff --exit-code docs/supabase-schema.sql   # only if you changed migrations
```
CI runs the same checks. Never commit secrets, and never weaken a security check to make a test pass: fix the cause.

## Website (`web/`)
```sh
npm --prefix web ci && npm --prefix web test && npm --prefix web run build && npm --prefix web run check:routes
```
See `web/README.md` for the CSP, contrast and theme rules.

## Docs
User-facing pages live in `site/docs/*.md` (add new ones to `NAV` in `src/site/site.ts`; the site tests check that every internal link resolves). Keep `docs/SITEMAP.md` in step when you add a page or endpoint. Changes go in `CHANGELOG.md`.

## Releasing
See [docs/RELEASING.md](docs/RELEASING.md).

## Security reports
Do not open public issues for vulnerabilities; email support@papercliped.co or see "Reporting a vulnerability" in [docs/SECURITY.md](docs/SECURITY.md).
