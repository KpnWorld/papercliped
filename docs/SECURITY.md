# Security model (public / multi-tenant deployment)

Read this before running the bridge for people other than yourself.

## What you are holding
For every connected user the bridge stores a **Paperclip board API key**. In Paperclip that key is bound to the *user*, not to a company, and carries **all** of that user's board power (verified in Paperclip's source: `board_api_keys` has no scope column, and the challenge's `requestedCompanyId` is only used to attribute activity-log entries, not to restrict the key). The bridge's scopes (read/control/admin) limit what *connected AI clients* may do through the bridge. They do **not** limit what the stored key can do if the bridge itself is compromised.

> **Headline risk:** a full compromise of the running bridge (code execution on the Render service *and* access to its environment) exposes every connected user's Paperclip with full board access, until those keys are revoked. Everything below reduces the likelihood or blast radius; none of it removes that risk. Until Paperclip offers scoped/short-lived keys, tell users plainly, encourage a dedicated Paperclip user for the connection, and keep the user base small enough to be comfortable with that.

## Trust boundaries
```
AI client (claude.ai, ChatGPT)  ──OAuth, scoped, opaque tokens──▶  Bridge  ──user's board key, https only──▶  User's Paperclip (stranger-controlled)
                                                                     │
                                                                     └──▶ Postgres (sealed credentials, token hashes)
```

## Threats and mitigations (each marked with where it is tested)
| # | Threat | Mitigation | Test |
| - | --- | --- | --- |
| 1 | **SSRF**: a user types an internal/metadata address as their "Paperclip" | https-only DNS names, no IP literals (incl. decimal/hex/IPv6/Unicode-dot forms), port allow-list (443), no `.local/.internal/.lan/…`, bridge's own host denied; **the resolved address is validated inside the connection's DNS lookup**, so there's no check-then-connect gap for DNS rebinding; any non-public answer refuses the whole name; no redirects; 20 s / 2 MB caps | `safe-fetch.test.ts`, `multitenant.test.ts` (nothing leaves the bridge for 15 hostile inputs) |
| 2 | Hostile "Paperclip" returns crafted data (bad ids, `@evil.com` approval link, non-JSON, huge bodies) | every field validated (uuid ids, strict approval-path pattern, token charset/length, bounded expiry); only whitelisted statuses honoured; `local_trusted` refused; body capped | `multitenant.test.ts` (hostile cases) |
| 3 | Probing the network through the instance step | per-request attempt cap (5), per-IP rate limit, no error detail from resolution/connection leaks to the user | same |
| 4 | Cross-tenant mix-up (user A's token sent to B's host) | each grant stores its own instance; the client is built per request from that grant only; the instance is re-validated on **every** call (tampered/newly denied hosts are cut off); the raw-API tool takes only a path | `tenant isolation`, `re-validates the stored instance` |
| 5 | Database leak | credentials sealed in the app with AES-256-GCM (key from `BRIDGE_SECRET`, never in the DB); tokens stored as SHA-256 only; consumed authorization codes are scrubbed; **the database alone yields nothing usable** | `multitenant.test.ts` (Postgres at-rest check) |
| 6 | Supabase Data API exposes the tables | dedicated `bridge` schema (not exposed by default), RLS on with no policies, grants revoked from `anon`/`authenticated`; app uses a role that can touch only these tables | `store.test.ts` (anon/authenticated denied; least-privilege role) |
| 7 | OAuth attacks: code interception, replay, CSRF, open redirect, mix-up | PKCE S256 mandatory; single-use 60 s codes (atomic in SQL; replay revokes the grant it created); CSRF token on every form; never redirects to an unregistered `redirect_uri`; allow-listed redirect hosts; `iss` in responses | `oauth.test.ts`, `store.test.ts` (races) |
| 8 | Token theft | opaque tokens, 1 h access / 30 d refresh; refresh rotation with **reuse detection** (revokes the grant and the Paperclip key); atomic consume so a race can't mint two | `oauth.test.ts`, `store.test.ts` |
| 9 | Over-privileged AI client / prompt injection into the model | read/control/admin enforced by the bridge, admin never preselected, out-of-scope tools hidden and refused; confirm gates on destructive calls; per-grant call budget (120/min) | `oauth.test.ts`, `multitenant.test.ts` |
| 10 | Stale credentials linger after a user "disconnects" in the client (clients often just forget tokens) | hourly sweep revokes grants idle > 30 days and deletes the credential; `/revoke` honoured; Paperclip key revoked upstream (`revoke-current`). The key's name in the user's Paperclip is `<client> (via bridge, returns to <host>) (board)` so they can see/revoke it themselves | `multitenant.test.ts` (sweep) |
| 11 | Phishing via a malicious OAuth client claiming to be "Claude" | clients register only allow-listed redirect hosts; the Paperclip approval page shows the real redirect host in the key label; the consent page shows the redirect host and the instance host | `oauth.test.ts` |
| 12 | Brute force of the instance/consent/token endpoints | per-IP and per-grant limits in the shared store (work across several instances); client IP taken from the trusted-proxy position, not the forgeable left side of `X-Forwarded-For` | `multitenant.test.ts` |
| 13 | Clickjacking / XSS on consent pages | CSP (`frame-ancestors 'none'`, nonce'd script, restricted `form-action`), `X-Frame-Options`, all dynamic text escaped | `oauth.test.ts` |
| 14 | Operator error: unsafe public config | the process refuses to start for: http issuer, short secret, `BRIDGE_TOKEN` set in multi mode, static login in multi mode, no database in multi mode | `multitenant.test.ts` |
| 16 | Telemetry becoming a data leak / a side door | audit rows hold only tool name, outcome, timings, grant id, client name, tenant host, user id (never arguments, results, tokens or credentials); retention 30 days; recorder can't block or fail a request; the panel is a SEPARATE process with its own token (cannot call tools), a read-only database role limited to safe views (no secret hashes, sealed credentials or tokens), refuses to start with bridge secrets in its environment, optional IP allow-list, signed HttpOnly SameSite=Strict sessions, rate-limited sign-in, strict CSP (no external loads), and renders all data with `textContent` | `audit.test.ts` |
| 15 | Key compromise / rotation | key ring (`BRIDGE_SECRET_PREVIOUS`), `rotate-keys`, `revoke-all --yes` | `multitenant.test.ts` |

## Residual risks (not mitigated here)
1. **Bridge compromise = access to all connected Paperclips** (headline risk above). Reduce: minimal dependencies, pinned versions, 2FA on Render/GitHub/Supabase, no shell access to the service, alerts on unusual `audit` volume.
2. **A user's own Paperclip can feed prompt-injected text to the AI client.** The skill instructs the model to treat tool output as data, but that is not a hard boundary. Scopes bound the damage (a read-only connection can't change anything).
3. **No per-company limits.** A grant reaches every company that user can reach (Paperclip limitation, see above).
4. **DNS rebinding after connect, TLS interception by a hostile network between Render and a tenant:** TLS verification is on; we do not pin certificates.
5. **Single database, single region, single secret.** Losing `BRIDGE_SECRET` disconnects everyone (by design: it cannot be recovered).
6. **Not independently audited.** Treat this as unreviewed code. Before a wide public launch, get an external review of `src/net/safe-fetch.ts`, `src/oauth/*` and the migrations.
7. DCR clients accumulate (idle ones are pruned after 7 days; capped at 1000).
8. ChatGPT's real redirect hosts and Claude's directory-review requirements were taken from documentation/secondary sources, not tested.

## Operational checklist
- [ ] `BRIDGE_SECRET` stored in a password manager, separate from the database backups
- [ ] `DATABASE_SSL=verify` with the Supabase CA (not `require`)
- [ ] App uses the `bridge_app` role; admin role only in `DATABASE_MIGRATE_URL`
- [ ] `bridge` schema not in Supabase's exposed schemas; anon-key read of `bridge.grants` fails
- [ ] 2FA on Render, Supabase, GitHub, npm
- [ ] Log retention ≤ 30 days; confirm logs contain no tokens (audit lines hold tool, grant id, client, instance host, user id only)
- [ ] Privacy policy + terms published; support and security contact set
- [ ] `revoke-all --yes` rehearsed on staging
- [ ] External security review done (before >~50 users or any directory listing)

## Reporting a vulnerability
Email **support@papercliped.co** with details (put "security" in the subject), or open a private GitHub security advisory on `OpenSourcx/papercliped`; please don't open public issues for security reports. We aim to acknowledge within 3 business days.

## Accounts, secret keys and anonymity (v1.0.0-beta.1)

- A user's **secret key** is shown once, stored only as a salted scrypt hash, and works like a password for *their Paperclip connection*: anyone holding it can sign in as them. Users can replace it by reconnecting through Paperclip approval.
- Usernames appear only in the operator's logs and panel. With **anonymous mode** on, logs, grants and audit rows show an alias (`Ann02`) and a masked instance label instead; toggling rewrites history. This is **pseudonymity, not anonymity from the operator**: someone with base-table database access (the bridge role, the Supabase admin) can still map alias → account. The panel role cannot.
- Account actions are rate-limited per username and per address; failed sign-ins never reveal whether a username exists beyond what registration already shows.

## Connection manager and Paperclip plugin links (v1.2.0-beta.1)

- The manager (`/manage`) uses a signed, `HttpOnly`, `SameSite=Strict` session cookie; every state-changing call also needs a JSON content type and the `x-papercliped` header (CSRF). Sensitive actions (new secret key, disconnect Paperclip, delete account) re-ask for the secret key and share the sign-in throttle.
- **Plugin links:** a one-time code (`pcl_…`, 10 minutes, single use, stored hashed) is made only from a signed-in beta browser session and exchanged (IP rate-limited; wrong, used and expired codes answer identically) for a long-lived token (`pcb_pl_…`, stored hashed on a grant with **no scopes**, 180-day expiry).
- A plugin token opens only the manage API for its own account. It can **not** call the MCP or Actions endpoints, make link codes, change the beta, sign out, or do any secret-key action (those answer 403), and it can remove only itself. Making a new secret key revokes every plugin link. Tests: `test/manage.test.ts` ("Paperclip plugin link").
- The plugin runs as trusted, same-origin code inside Paperclip and is installed only by the instance admin. Its worker keeps each person's token in plugin state keyed by a hash of the host-verified user id, never returns it to the page, and talks only to an `https` bridge URL. Residual risk: anyone able to read the plugin's state storage (the Paperclip server operator) can use a linked token for the manage API; unlink from `/manage` if the Paperclip host is not trusted.
- The plugin has not been run in a live Paperclip; see `plugin/README.md`.

## Planned (v2): managed subdomains
See `docs/V3-SUBDOMAINS.md` §7a for the hardening list and the threats to add here when it is built.
