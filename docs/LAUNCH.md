# Launch guide — Papercliped v1.0.0-beta.1

Everything here costs **$0/month** (Render free, Supabase free, Cloudflare free). Do the steps in order. Nothing in this repo has been run against a live Render, Supabase, claude.ai or ChatGPT yet — treat the first pass as a staging run and finish with the smoke test (§8).

Never paste database passwords, `service_role` keys or `BRIDGE_SECRET` into chats, issues or commits. They go only into the host's environment settings.

## 1. Supabase (database)
1. Open your project → **SQL Editor** → paste all of [`docs/supabase-schema.sql`](supabase-schema.sql) → Run. (This is the full schema: accounts, grants, tokens, audit log, community log, node health, privacy, panel views.)
2. Create the two least-privilege roles. Edit the passwords, then run [`docs/least-privilege.sql`](least-privilege.sql) (role `bridge_app`, used by the bridge) and [`docs/panel-role.sql`](panel-role.sql) (role `panel_ro`, **read-only**, used by the panel).
3. **Project Settings → Database**: copy the **Transaction pooler** (port 6543) and **Session pooler** (port 5432) host/user details and the **SSL certificate** (CA). Build:
   - `DATABASE_URL` = transaction pooler as `bridge_app`
   - `DATABASE_MIGRATE_URL` = session pooler as the admin (`postgres.<ref>`) role — used only to apply future migrations at start
   - `PANEL_DATABASE_URL` = transaction pooler as `panel_ro`
4. Free projects pause after about a week of inactivity. The bridge writes a heartbeat every 10 min while awake and the keep-alive in §5 touches `/readyz` (a database query) every 5 min, so it never goes quiet.

## 2. Render (the bridge) — Docker web service, no Blueprint
Blueprints are not needed (and the paid features are not used). The repo ships a [`Dockerfile`](../Dockerfile); you create the service by hand:
1. Render → **New → Web Service** → connect `OpenSourced/papercliped` → branch `main`.
2. **Language: Docker** (Render finds the Dockerfile). **Region: Oregon** (next to Supabase us-west-2). **Instance type: Free**. Leave start command empty (the image runs `node dist/http.js`). Set **Health Check Path** to `/readyz`.
3. **Environment variables** (Advanced → Add):

| Key | Value |
|---|---|
| `BRIDGE_OAUTH` | `1` |
| `BRIDGE_MODE` | `multi` |
| `BRIDGE_PUBLIC_URL` | `https://papercliped.kpnsolute.com` |
| `BRIDGE_SECRET` | output of `openssl rand -hex 32` — **back it up now**; losing it disconnects every user |
| `DATABASE_URL` | transaction pooler as `bridge_app` (§1) |
| `DATABASE_MIGRATE_URL` | session pooler, admin role |
| `BRIDGE_AUTO_MIGRATE` | `1` (free plans have no pre-deploy hook) |
| `DATABASE_SSL` | `verify` |
| `DATABASE_CA` | Supabase CA PEM (`\n` for newlines); without it use `require` (weaker) |
| `BRIDGE_PROXY_HOPS` | `1` |
| `BRIDGE_KEEPALIVE` | `1` |
| `SITE_CONTACT` | an email address or support URL shown on the privacy and terms pages |

4. **Create Web Service.** Watch the logs for `migrations applied` and `paperclip-bridge listening`, then open `https://<service>.onrender.com/healthz`.
5. Free-plan facts: the service sleeps after ~15 min without traffic (cold start ≈ 1 min) and the free allowance (750 h/month) is shared across the workspace, so keep **only the bridge** on Render (the panel is §7).

You can test the image anywhere with Docker: `docker build -t papercliped . && docker run --rm -p 10000:10000 -e PORT=10000 -e BRIDGE_TOKEN=$(openssl rand -hex 32) papercliped`.

## 3. Domain: papercliped.kpnsolute.com (Cloudflare)
1. Render → your service → **Settings → Custom Domains → Add** `papercliped.kpnsolute.com`. Render shows the CNAME target.
2. Cloudflare → `kpnsolute.com` → **DNS → Add record**: Type `CNAME`, Name `papercliped`, Target `<service>.onrender.com`, **Proxy status: DNS only (grey cloud)** at first.
3. Back in Render click **Verify**; it issues the TLS certificate (a few minutes). When `https://papercliped.kpnsolute.com/healthz` answers, you may turn the orange cloud on (SSL/TLS mode **Full (strict)**). If you do, set `BRIDGE_PROXY_HOPS=2` (Cloudflare + Render) and re-test sign-in rate limiting.
4. `BRIDGE_PUBLIC_URL` is the OAuth issuer and is baked into every token. **Set it to the final domain before connecting any client**; changing it later disconnects everyone.

## 4. Check it works
```bash
curl https://papercliped.kpnsolute.com/readyz                      # {"ok":true,...}
curl https://papercliped.kpnsolute.com/.well-known/oauth-authorization-server | head
```

## 5. Keep it awake (Cloudflare Worker, free)
The in-app timer cannot wake a sleeping service, so an outside pinger is required.
```bash
cd deploy && npx wrangler login && npx wrangler deploy      # edit TARGET_URL in wrangler.toml first if your domain differs
```
It runs every 5 minutes (cron `*/5 * * * *`) against `/readyz`. Open the worker's URL once to see the last result. Alternative: a free UptimeRobot HTTP monitor on `/readyz` at a 5-minute interval. Free hosting can still have occasional cold starts — the first request after a platform restart may take about a minute.

## 6. Install paths for users
- **Claude (claude.ai / Desktop / mobile):** Settings → Connectors → *Add custom connector* → `https://papercliped.kpnsolute.com/mcp`. Claude opens the Papercliped sign-in page.
- **Claude Code:** `claude mcp add --transport http papercliped https://papercliped.kpnsolute.com/mcp`, or install the plugin: `/plugin marketplace add OpenSourced/papercliped` then `/plugin install papercliped@papercliped`.
- **npm / local stdio:** `npx papercliped` with `PAPERCLIP_API_URL` and `PAPERCLIP_API_KEY` set.
- **ChatGPT:** custom MCP app with the same `/mcp` URL (where your plan offers it), or import `https://papercliped.kpnsolute.com/openapi.json` as a GPT Action (see [chatgpt.md](chatgpt.md)).

First sign-in: pick a username (6–32 characters, at least one number or `.` `#` `_`), connect your Paperclip (public https URL; approve in Paperclip), and **save the secret key shown once**. Later: sign in with username + key, or reconnect through Paperclip approval and keep the same account. Tick *Appear anonymously* to be shown as an alias like `Ann02`.

## 7. The operator panel (separate program)
The panel never sees bridge secrets and only has read access (`panel_ro`). Its environment is exactly:
```
PANEL_ADMIN_TOKEN=<openssl rand -hex 32>
PANEL_DATABASE_URL=<panel_ro URL>   PANEL_DATABASE_SSL=verify   PANEL_DATABASE_CA=<PEM>
PANEL_ALLOWED_IPS=<your IP>         # strongly recommended
```
It refuses to start if `BRIDGE_SECRET` or `DATABASE_URL` is present.
- **Easiest ($0, no extra hours):** run it on your own machine — `npx papercliped-panel` — and open http://127.0.0.1:3940.
- **Always-on:** a second free Render service shares the 750 free hours and could suspend the bridge, so don't. Use another free host (Fly.io, Koyeb, a home server) or put it behind Cloudflare Tunnel + Cloudflare Access.
- Preview with fake data: `PANEL_DEMO=1 PANEL_ADMIN_TOKEN=<24+ chars> npx papercliped-panel`.

The panel shows system health (and turns critical if the bridge stops reporting — asleep, crashed or cut off from the database), latency percentiles, bridge-vs-Paperclip time, faults vs. caller errors, user count, flow success rate and the live log:
`09:25:30 og.kpnwrld - joined cliped` · `… - left cliped` · `… - updated cliped`.
Anonymous users appear as their alias. Operator commands: `npx papercliped-admin users | delete-user <name> | grants | revoke <id> | revoke-all --yes`.

## 8. Smoke test (before announcing)
1. Add the connector in claude.ai, create an account, connect a real Paperclip, ask "list my agents".
2. Disconnect, reconnect with the secret key; reconnect again through Paperclip approval (same account).
3. Toggle anonymity; confirm the panel shows the alias for old and new entries.
4. Stop traffic for 20 min; confirm the Cloudflare worker keeps the service answering and the panel shows it healthy.

## 9. Marketplaces — submit only after the smoke test passes
Requirements change; confirm each against the current official page before submitting.

**Claude directory (connectors / plugins)** — have ready: public GitHub repo (done), plugin manifest [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json), the remote MCP URL `https://papercliped.kpnsolute.com/mcp`, OAuth callbacks (`https://claude.ai/api/mcp/auth_callback`, Claude Code's localhost loopback), privacy policy and terms (served by the bridge at `https://papercliped.kpnsolute.com/privacy` and `/terms`; set `SITE_CONTACT` to a real contact address), a support contact, tool descriptions with read/write annotations, and a **test account** with a demo Paperclip for reviewers. Submit through Anthropic's connector/plugin submission form linked from the Claude docs. Until listed, users install through the custom-connector or `/plugin marketplace add` paths above.

**ChatGPT (apps / GPT Store)** — an MCP app needs a public https MCP endpoint with OAuth (you have it), a privacy policy URL, and domain verification in the OpenAI developer dashboard; a GPT with Actions needs the OpenAPI URL and OAuth settings (see [chatgpt.md](chatgpt.md)). Submission details for the apps directory are still moving — follow OpenAI's current "apps SDK / submit your app" guide.

## 10. npm
```bash
npm login                      # account with 2FA
npm run build && npm test
npm publish --tag beta         # first publish of "papercliped"; check the name is free first: npm view papercliped
```
Users run `npx papercliped@beta`. With the repo secret `NPM_TOKEN` set, pushing a `v*` tag runs [`release.yml`](../.github/workflows/release.yml), which publishes with provenance and creates the GitHub release. If the name `papercliped` is taken, use a scope (`@kpnworld/papercliped`) and change `name` in `package.json`.

## 11. GitHub release "v1.0.0-beta.1"
Releases → **Draft a new release** → tag `v1.0.0-beta.1` (target `main`) → title *Papercliped v1.0.0-beta.1* → paste [`CHANGELOG.md`](../CHANGELOG.md) → tick **Set as a pre-release** → Publish.
