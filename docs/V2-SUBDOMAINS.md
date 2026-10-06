# v2 plan: managed subdomains (paid)

Status: **plan, nothing built.** Written from the product discussion of 2026-10-06. Items marked **DECIDED** came from the owner; items marked **PROPOSED** are recommendations awaiting a decision; **OPEN** needs an answer. Legal documents (Subdomain Terms, refund and tax wording) are **out of scope here** and will be drafted separately; section 9 lists what they must cover.

## 1. Goal
Users who cannot get a public `https://` address for their Paperclip can pay **$5 once** to get one: `https://<their-username>.<our-domain>`, tunnelled to their local Paperclip. We provision it; they run one command on their Paperclip machine. Using their own domain stays the encouraged path (see `site/docs/connect-your-paperclip.md`).

## 2. Decisions (DECIDED)
- **Price:** $5, one-time, for the subdomain name and its setup. It is not hosting and not ownership.
- **The name is the user's username.** Usernames cannot be changed, so the subdomain label never changes. We never create domains for users, only a subdomain under our domain.
- **Base domain may change** (today `kpnsolute.com`). The registry stores the **label**, not the full address; the base domain is configuration. The label stays registered to the user across any domain change.
- **Purpose is limited:** the subdomain is an access address for the user's own Paperclip, like a handle on a platform, not a place to run a business's public site.
- **Open to everyone at launch (not beta-only).** Paying the $5 makes the user a **pro member**: they get everything beta accounts get (the connection manager at `/manage` and the plugin) plus **management of their domain** (see 4a). Beta stays a separate, free opt-in. The manager's gate changes from `beta` to `beta OR pro`; store a `pro_since` timestamp on the account, set by the paid order.
- **Symbols are remapped, not refused.** The username stays the user's identity; only the hostname is derived from it by replacing the symbols with hyphens (rules in 6.2).
- **Anonymous mode does not affect the subdomain.** Anonymous only hides a user from the public live log and the operator panel (it shows an alias there). The username is still the username, so anonymous users get the same `<username>.<domain>` as everyone else.
- **Cloudflare terms (checked by the owner, not re-verified by us):** the service is fine as long as users do not use the subdomains for actual business uses. The Subdomain Terms and the abuse checks in section 7 must enforce this. **For the legal drafting:** decide exactly where "business use" starts. Working line so far: reaching your own Paperclip through the name is allowed even if that Paperclip supports a business; using the name as a public site, API, storefront or brand, or serving anyone else's service, is not.
- **Entry point:** a link on the connect screen ("No public address? We've got you covered.") to `/domain` on the bridge site. `/domain` offers: (1) buy a domain yourself and follow the guide, (2) use a domain you own and follow the guide, (3) let us do it ($5).
- **Provisioner runs on the owner's home server**, using Cloudflare.
- Legal documents are drafted later (not in this doc).

## 3. Architecture
```
user's browser/Claude ──https──▶ Cloudflare edge ──tunnel──▶ cloudflared on user's machine ──▶ localhost:3100 (Paperclip)

bridge (Render) ── job queue (Postgres) ◀── polls (outbound HTTPS only) ── home server ── Cloudflare API
```
- Remotely managed Cloudflare Tunnel **per user**. We set the ingress (one hostname → `http://localhost:<port>`) and the DNS record through the Cloudflare API. The user only runs the connector with their tunnel token.
- **The home server is not in the data path.** If it is down, new orders wait; existing tunnels keep working.
- **The Cloudflare API token lives only on the home server**, scoped to the one zone and to tunnels. It is never on the hosted bridge. The home server polls the bridge for jobs over outbound HTTPS, so no ports are opened at home.
- A provider interface (Cloudflare now, a fake for tests) so another backend can replace it.

## 4. User flow
1. Connect screen link → `/domain` → choose "let us do it".
2. **Register first** (see 6.4): choose a username, get the secret key, no Paperclip needed yet.
3. Enter the local address (normally `localhost:3100`; only `localhost`/`127.0.0.1` plus a port are accepted, since we configure where the user's own connector forwards).
4. Accept the Subdomain Terms (acceptance recorded: version + timestamp + account), pay $5 with Stripe Checkout.
5. A signed Stripe webhook confirms the order → job queued → home server provisions → bridge stores the tunnel and shows one command to run (`cloudflared service install <token>`; exact per-OS steps to be taken from Cloudflare's docs).
6. Back to signup with the address filled in: Connect your Paperclip → approve in Paperclip.
7. `/manage` and the plugin show the tunnel's online status.

## 4a. Pro members: domain management (in `/manage` and the plugin)
- See the address (`label + base domain`), the tunnel status (online/offline, last seen) and the "is it Paperclip?" check result.
- Re-show the connect command and rotate the tunnel token (invalidates the old one; needs the secret key, like other sensitive actions).
- Change the local port the tunnel forwards to (still limited to `localhost`/`127.0.0.1` plus a port).
- Release the name (needs the secret key; starts the quarantine; does not refund).
- The label itself cannot be changed (it is derived from the username).
- Plugin tokens stay unable to do secret-key actions, so rotate/release remain browser-only.

## 4b. Later: slots (about two months after launch)
Pro members will be able to buy **3 slots for $10**. Each slot is an extra subdomain, so the first one stays "the username" and the extra ones are **user-chosen labels** under the same naming rules, uniqueness and quarantine. **Design now so this is not a rewrite:** do not make `subdomains.account_id` unique (allow many per account, with a `slot` number and a per-account limit), keep the Paperclip-verification and abuse checks per subdomain, and keep pricing in config. Pro members still cannot change the label of an existing name.

## 5. Data model (sketch)
- `accounts.pro_since` (nullable timestamp; set when the paid order completes).
- `subdomains`: `account_id`, `slot` (1 for the username label; more later), `label` (unique, lowercase), `tunnel_id`, `local_port`, `status` (`pending` | `active` | `suspended` | `released`), `terms_version`, `paid_at`, `order_id`, `created_at`, `released_at`.
- `subdomain_jobs`: `id`, `kind` (`provision` | `suspend` | `release` | `repoint`), `payload`, `state`, `attempts`, `claimed_by`, `claimed_until`, `result`, timestamps.
- `base_domains`: `domain`, `active`, `primary` (supports several at once during a change).
- `label_quarantine`: `label`, `released_at`, `until`.
- Address shown to users = `label + primary base domain`. The stored Paperclip instance URL for the account is updated centrally on a domain change.

## 6. Hard problems and proposed answers
1. **Anonymous mode (resolved).** It only hides the user from the public live log and counts, so it does not block the subdomain. Two guardrails: (a) never write a user's label or hostname into public events or the live log, so an alias can't be matched to a username (the live log and panel keep showing only the alias); (b) the order screen tells anonymous users that their subdomain is public and shows their username.
2. **Usernames are not valid hostnames (resolved: remap).** Derivation, applied in this order: lowercase; replace every run of `.` `#` `_` with a single `-` (a run collapses so a label never contains `--`, which is reserved for `xn--`); trim leading/trailing `-` (usernames already start with a letter or digit). Example: `OG.kpnwrld` → `og-kpnwrld`, `river#2026` → `river-2026`. The derived label is stored in `subdomains.label` and never changes. Different usernames can derive the same label (`og_dev7`, `og.dev7`, `og-dev7`), so uniqueness is enforced **on the label** at claim time, first come first served. A user whose label is already held cannot buy the managed subdomain (their username cannot change): show this **before** payment, charge nothing, and point them to the own-domain guide. Also add a reserved-label list (www, api, mail, admin and similar) on top of the existing username reserved list in `src/accounts/username.ts`.
3. **Released names can be re-taken.** Deleting an account currently frees its username. **PROPOSED:** quarantine a released label for about 12 months, and delete its DNS record and tunnel on release (prevents subdomain takeover).
4. **Signup order.** Today an account exists only after the user approves in their Paperclip (`src/oauth/provider.ts`, account creation at the pending-approval step), which a user with no public address cannot do. A **register-first path** is needed: username + secret key without a Paperclip link, then pay, then connect. This touches the account model and the recovery-by-approval path, and is the largest piece of v2.
5. **Changing the base domain** is not free for users: their Paperclip must accept the new hostname (a setting on their machine). Keep both hostnames live for a long overlap; keep renewing the old domain for as long as users depend on it. If the domain lapses, every user breaks at once.
6. **Shared registrable domain.** Putting users directly under `kpnsolute.com` shares cookies and reputation with other KpnWorld sites. **PROPOSED:** a dedicated domain, one level only (`name.domain`), because Cloudflare's free certificate is believed to cover only one subdomain level (**unverified**). **OPEN:** which domain.

## 7. Abuse and operations
- **One service per name:** ingress is set by us (one hostname, one local port); users cannot reconfigure it.
- **Verify the address and port really are a Paperclip (required, at three points):**
  1. **Before activation:** the order's job only marks the name active after the tunnel is up and `GET https://<label>.<domain>/api/health` returns the Paperclip shape (`status`, `deploymentMode`, `deploymentExposure`). Until then the name is `pending`, and unverified names are cleaned up after a short timeout.
  2. **When the user connects:** the existing "Connect your Paperclip" step (the user approving the request inside their own Paperclip) already proves the address is a Paperclip they can sign in to. Bind the subdomain to the Paperclip user and instance id from that step; if the instance later reports a different identity, suspend and review.
  3. **Continuously:** a scheduled check (for example every few hours, with jitter) repeats the health probe. Failing or non-Paperclip responses get a warning, then suspension; the result is shown to the user in `/manage`.
  - **Port and routing rules:** the ingress target is only `localhost`/`127.0.0.1` plus one port set by us; users cannot add rules. Consider limiting what the public hostname forwards (for example only the Paperclip API and its UI paths) once Paperclip's required paths are confirmed.
  - **Probe safety:** the probes go through the same SSRF-hardened fetch as the rest of the bridge, with short timeouts and a response size cap.
- **Suspension** is one switch (job `suspend`): remove ingress/DNS, keep the label reserved.
- Rate-limit orders and provisioning; reconcile Cloudflare state against the database on a schedule (orphaned tunnels/records are deleted).
- Refund automatically if provisioning fails.
- Idle reclaim: **PROPOSED** only after about 12 months with the tunnel offline, with notices.

## 7a. Security hardening to do with v2
- Home-server worker: outbound-only polling with a signed per-worker credential; jobs are idempotent and carry no secrets other than what the provider needs; the Cloudflare token is least-privilege (one zone, tunnels), stored only on the home server, rotated on a schedule.
- Webhooks: verify the Stripe signature, reject replays, process each order once.
- Tunnel tokens: shown only to the owner, re-showing or rotating needs the secret key, never written to logs or the public events.
- Label rules: reserved list, impersonation/brand blocklist, quarantine, DNS and tunnel deleted on release; reconcile Cloudflare against the database on a schedule.
- Public events and live log never contain labels or hostnames (anonymous users included).
- Rate limits on order, claim, probe and token endpoints; audit every provisioning action.
- Extend `docs/SECURITY.md` and its threat table for: provisioner compromise, Cloudflare token theft, label squatting/takeover, abuse of the tunnel for non-Paperclip traffic, payment fraud and refunds.

## 8. Payments
Stripe Checkout (no card data on our side); orders confirmed only by a verified webhook signature; idempotent on order id; the label is held for ~15 minutes during checkout so two people cannot pay for one name. Tax and refund handling to be decided with the legal drafting.

## 9. For the later legal drafting (Subdomain Terms)
Cover: purpose limit (access address for your own Paperclip; internal use that supports a business is fine, using the name as the public face of a business or hosting other services is not); the name is a revocable licence tied to the account, not property, not transferable, one per account; our rights to suspend/reclaim for abuse or breach and to change base domains with notice; no uptime promise (depends on Cloudflare and the user's machine); refunds only if provisioning fails; conduct and impersonation/trademark rules; what metadata we keep (hostname, tunnel status, not traffic content); acceptance recorded at checkout. Needs a lawyer's review before taking payments, including sales tax.

## 10. Open questions
1. 12-month quarantine and idle-reclaim periods?
2. Which domain (dedicated, one level)?
3. If a name is suspended for abuse or reclaimed, does the account keep pro? (Proposal: pro ends only if the name is suspended for breaking the terms; a released name keeps pro status.)
4. Still to verify with Cloudflare's current docs: tunnels per account, DNS records per zone, certificate coverage for subdomains, per-OS service install steps.

## 11. Phases
1. **Provisioning core:** migration, provider interface + fake, job queue, home-server worker, claim/release/suspend, label rules.
2. **Register-first account path** and the Stripe order flow.
3. **Connect UX:** `/domain` page, the link on the connect screen, tunnel status in `/manage` and the plugin, docs.
4. **Hardening:** health check, suspension, reconcile, quarantine, domain-change tooling.
