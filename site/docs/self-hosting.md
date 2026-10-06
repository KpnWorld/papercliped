# Run it yourself

You can run Papercliped three ways. All of them are free and use the same code as the hosted service.

## 1. Locally, for yourself (stdio)
The simplest: Papercliped runs on your computer and talks straight to your Paperclip. No account or database.
```
npx papercliped@latest
```
Set these where your AI app configures MCP servers:
| Variable | Value |
| --- | --- |
| `PAPERCLIP_API_URL` | Your Paperclip's address, e.g. `http://localhost:3100` |
| `PAPERCLIP_API_KEY` | A Paperclip **board** token (agent keys can't pause or approve) |
| `PAPERCLIP_COMPANY_ID` | Optional default company |
| `PAPERCLIP_READ_ONLY` | `1` to block every change |

This works with a Paperclip on your own network, too.

## 2. A bridge for one Paperclip (team)
Run the HTTP bridge in front of one Paperclip, with OAuth so claude.ai and ChatGPT can connect:
```
BRIDGE_OAUTH=1 BRIDGE_MODE=single BRIDGE_PUBLIC_URL=https://bridge.example.com \
BRIDGE_SECRET=$(openssl rand -hex 32) PAPERCLIP_API_URL=https://paperclip.example.com \
npx -p papercliped@latest papercliped-bridge
```
Put TLS in front (Caddy, a Cloudflare Tunnel, or your host's HTTPS) so the public address is `https://`. State can live in a JSON file (`BRIDGE_DATA_FILE`) or Postgres (`DATABASE_URL`).

## 3. A public multi-user bridge (like papercliped.co)
`BRIDGE_MODE=multi`: every user connects their own Paperclip. This needs Postgres. The full, step-by-step guide (Supabase free, Render free with Docker, a Cloudflare domain, a keep-alive worker and a smoke test) is `docs/LAUNCH.md` in the repository.

The short version:
1. **Database:** paste `docs/supabase-schema.sql` into your Postgres, then create the `bridge_app` role from `docs/least-privilege.sql`.
2. **Service:** deploy the repository's `Dockerfile`. Set at least `BRIDGE_OAUTH=1`, `BRIDGE_MODE=multi`, `BRIDGE_PUBLIC_URL`, `BRIDGE_SECRET` (back it up), `DATABASE_URL` and `DATABASE_SSL=verify` with `DATABASE_CA`.
3. **Domain:** point your domain at the service and use **Full (strict)** TLS. Don't put a challenge page in front of `/mcp`, `/token`, `/authorize*` or `/.well-known/*`.
4. **Check:** `curl https://your-bridge/readyz` and `https://your-bridge/api/public/v1/status`.

All settings: [Environment variables](/docs/environment). Security model: [Security](/docs/security).

## Keep in mind
- `BRIDGE_PUBLIC_URL` is the OAuth issuer and is baked into every token: changing it disconnects every app.
- Losing `BRIDGE_SECRET` makes stored Paperclip keys unreadable. Rotate with `BRIDGE_SECRET_PREVIOUS` and `papercliped-admin rotate-keys`.
- A public bridge holds users' Paperclip credentials (encrypted). Read the security notes before inviting others.
