# Manage API

The JSON API behind the [manage page](/docs/manage) and the [Paperclip plugin](/docs/paperclip-plugin). It only ever acts on the signed-in account.

Base path: `{{URL}}/api/manage`. Responses are JSON with `Cache-Control: no-store`.

## Signing in
- **Browser session:** `POST /login` with `{ "username": "...", "secret": "pcs_..." }` sets an `HttpOnly`, `SameSite=Strict` cookie for 8 hours. Every request that changes something must send `Content-Type: application/json` and the header `x-papercliped: 1` (protection against cross-site requests).
- **Plugin token:** `Authorization: Bearer pcb_pl_...` (from the plugin link flow). No custom header needed. It can do less than a session; see the table.

## Endpoints
| Method and path | What it does | Session | Plugin token |
| --- | --- | --- | --- |
| `POST /login` | Sign in with username and secret key | — | — |
| `POST /logout` | Clear the session cookie | ✓ | ✕ |
| `GET /me` | Name, anonymity, beta, connected Paperclip | ✓ | ✓ |
| `POST /beta` `{ "beta": true }` | Join or leave the beta | ✓ | ✕ |
| `GET /connections` | Connected apps with level and last use (beta) | ✓ | ✓ |
| `POST /connections/:id` `{ "level": "read" \| "control" }` | Change an app's level (beta) | ✓ | ✓ |
| `DELETE /connections/:id` | Disconnect an app (beta) | ✓ | ✓ |
| `POST /privacy` `{ "anonymous": true }` | Turn anonymity on or off (beta) | ✓ | ✓ |
| `POST /plugin-link` | Make a one-time plugin link code (beta) | ✓ | ✕ |
| `POST /plugin-link/exchange` `{ "code": "pcl_..." }` | Trade a code for a plugin token | — | — |
| `GET /plugin-links` | Linked plugins (beta) | ✓ | ✓ |
| `DELETE /plugin-links/:id` | Unlink a plugin; a token may only remove itself (`self`) | ✓ | ✓ (own) |
| `POST /secret/rotate` `{ "secret": "..." }` | Make a new secret key (also unlinks every plugin) | ✓ + key | ✕ |
| `POST /paperclip/disconnect` `{ "secret": "..." }` | Forget your Paperclip key and disconnect every app | ✓ + key | ✕ |
| `POST /account/delete` `{ "secret": "...", "confirm": "<username>" }` | Delete the account | ✓ + key | ✕ |

"✓ + key" means the request must include your secret key again.

## Errors
`400` bad input or missing header, `401` not signed in (or the plugin token is unknown, expired or revoked), `403` not in the beta (`code: "beta_required"`), needs the browser (`code: "browser_required"`) or wrong secret key, `404` no such connection or link (also for other people's), `429` too many requests.

## Limits
Sign-in shares the sign-in page's limits (see [Limits and errors](/docs/limits-and-errors)). Signed-in requests are limited to 120 per minute per account. Plugin code exchanges are limited per address.
