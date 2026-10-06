# Environment variables

Every setting the bridge reads, with its default. Only set what you need. Never put secrets in issues or commits.

## Papercliped status tool
| Variable | Default | Meaning |
| --- | --- | --- |
| `PAPERCLIPED_URL` | `https://papercliped.co` | Where the `papercliped_service_status` tool reads the public status API (https only) |

## Paperclip (all modes)
| Variable | Default | Meaning |
| --- | --- | --- |
| `PAPERCLIP_API_URL` | `http://localhost:3100` | Your Paperclip (local and single modes). `/api` is added if missing. |
| `PAPERCLIP_API_KEY` | none | Board token for local and single modes (not needed in Paperclip's `local_trusted` mode) |
| `PAPERCLIP_COMPANY_ID` | none | Default company for tools that take one |
| `PAPERCLIP_READ_ONLY` | off | `1` blocks every change before it reaches Paperclip |
| `PAPERCLIP_TIMEOUT_MS` | `30000` | Timeout for each Paperclip call |
| `PAPERCLIP_PUBLIC_URL` | none | Single mode: the Paperclip address users' browsers open to approve sign-in, if different from the API address |

## HTTP bridge
| Variable | Default | Meaning |
| --- | --- | --- |
| `BRIDGE_HOST` | `127.0.0.1` (`0.0.0.0` when `PORT` is set) | Address to listen on |
| `BRIDGE_PORT` / `PORT` | `3939` | Port |
| `BRIDGE_PUBLIC_URL` | none | The public https origin. With OAuth it is the issuer: changing it disconnects every app |
| `BRIDGE_TOKEN` | none | Static bearer token (single-Paperclip setups, ChatGPT Actions). Not allowed in multi mode |
| `BRIDGE_PROXY_HOPS` | `0` | Trusted reverse proxies in front (for client addresses in rate limits); `1` on Render, `2` behind Cloudflare proxying too |
| `BRIDGE_AUDIT_RETENTION_DAYS` | `30` | Audit rows older than this are deleted hourly |
| `BRIDGE_AUDIT_STDERR` | on | Also print each audit event as a JSON line |
| `BRIDGE_KEEPALIVE` | on | Free tiers: self-ping and database heartbeat every 10 minutes |
| `PUBLIC_HOSTS` | none | Host roles for one service on several hosts, e.g. `marketing=papercliped.co,www.papercliped.co;docs=docs.papercliped.co;api=mcp.papercliped.co;forum=forum.papercliped.co` (see `docs/DOMAINS.md`) |
| `FORUM_URL` | the marketing host's `/community` | Where the forum host redirects |
| `WEB_DIST` | `web/dist` next to the package | The built website; without it the bridge serves its own Markdown pages |
| `SITE_CONTACT` | the GitHub issues page | Contact shown on the privacy and terms pages |
| `SITE_EFFECTIVE_DATE` | `2026-10-06` | Date shown on the privacy and terms pages |

## OAuth (claude.ai, ChatGPT apps)
| Variable | Default | Meaning |
| --- | --- | --- |
| `BRIDGE_OAUTH` | off | `1` turns on the built-in OAuth 2.1 server |
| `BRIDGE_SECRET` | required | At least 32 characters (`openssl rand -hex 32`); seals stored credentials. Back it up |
| `BRIDGE_SECRET_PREVIOUS` | none | Comma-separated old secrets, for rotation |
| `BRIDGE_MODE` | `single` | `single` (one Paperclip) or `multi` (each user connects their own) |
| `BRIDGE_LOGIN` | `paperclip` | `paperclip` (approve in Paperclip) or `static` (operator password = `BRIDGE_TOKEN`; single mode only) |
| `BRIDGE_DATA_FILE` | none | JSON file for state (single mode, no database) |
| `BRIDGE_ACCESS_TTL_SEC` | `3600` | Access token lifetime |
| `BRIDGE_REFRESH_TTL_SEC` | `2592000` (30 days) | Refresh token lifetime |
| `BRIDGE_IDLE_REVOKE_DAYS` | `30` | Revoke connections unused this long (`0` = never) |
| `BRIDGE_CALLS_PER_MINUTE` | `120` | Tool calls per minute per connection |
| `BRIDGE_OAUTH_REDIRECT_HOSTS` | claude.ai, claude.com, chatgpt.com, chat.openai.com, platform.openai.com | Hosts allowed as OAuth redirect targets |
| `BRIDGE_INSTANCE_ALLOWLIST` | any | Multi mode: only these Paperclip hosts (`*.example.com` allowed) |
| `BRIDGE_INSTANCE_DENYLIST` | none | Multi mode: never these hosts |
| `BRIDGE_ALLOWED_PORTS` | `443` | Multi mode: ports a Paperclip address may use |
| `BRIDGE_ALLOW_EPHEMERAL` | off | Multi mode without a database, for local experiments only |

## Database (Postgres)
| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none | Postgres connection (required in multi mode) |
| `DATABASE_SSL` | `verify` | `verify`, `require` or `off` |
| `DATABASE_CA` | none | CA certificate (PEM; `\n` for newlines) for `verify` |
| `DATABASE_POOL_MAX` | `10` | Connection pool size |
| `BRIDGE_AUTO_MIGRATE` | off | Apply migrations at start |
| `DATABASE_MIGRATE_URL` | `DATABASE_URL` | A different (admin) connection for migrations |
