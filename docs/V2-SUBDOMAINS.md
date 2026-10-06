# v2 plan: managed subdomains (paid)

Status: **plan, nothing built.** Written from the product discussion of 2026-10-06. Items marked **DECIDED** came from the owner; items marked **PROPOSED** are recommendations awaiting a decision; **OPEN** needs an answer. Legal documents (Subdomain Terms, refund and tax wording) are **out of scope here** and will be drafted separately; section 9 lists what they must cover.

## 1. Goal
Users who cannot get a public `https://` address for their Paperclip can pay **$5 once** to get one: `https://<their-username>.<our-domain>`, tunnelled to their local Paperclip. We provision it; they run one command on their Paperclip machine. Using their own domain stays the encouraged path (see `site/docs/connect-your-paperclip.md`).

## 2. Decisions (DECIDED)
- **Price:** $5, one-time, for the subdomain name and its setup. It is not hosting and not ownership.
- **The name is the user's username.** Usernames cannot be changed, so the subdomain label never changes. We never create domains for users, only a subdomain under our domain.
- **Base domain may change** (today `kpnsolute.com`). The registry stores the **label**, not the full address; the base domain is configuration. The label stays registered to the user across any domain change.
- **Purpose is limited:** the subdomain is an access address for the user's own Paperclip, like a handle on a platform, not a place to run a business's public site.
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

## 5. Data model (sketch)
- `subdomains`: `account_id` (unique), `label` (unique, lowercase), `tunnel_id`, `local_port`, `status` (`pending` | `active` | `suspended` | `released`), `terms_version`, `paid_at`, `order_id`, `created_at`, `released_at`.
- `subdomain_jobs`: `id`, `kind` (`provision` | `suspend` | `release` | `repoint`), `payload`, `state`, `attempts`, `claimed_by`, `claimed_until`, `result`, timestamps.
- `base_domains`: `domain`, `active`, `primary` (supports several at once during a change).
- `label_quarantine`: `label`, `released_at`, `until`.
- Address shown to users = `label + primary base domain`. The stored Paperclip instance URL for the account is updated centrally on a domain change.

## 6. Hard problems and proposed answers
1. **Anonymous mode (resolved).** It only hides the user from the public live log and counts, so it does not block the subdomain. Two guardrails: (a) never write a user's label or hostname into public events or the live log, so an alias can't be matched to a username (the live log and panel keep showing only the alias); (b) the order screen tells anonymous users that their subdomain is public and shows their username.
2. **Usernames are not valid hostnames.** Allowed username characters include `.` `#` `_`, which are not valid in a single DNS label (and `.` would create a second label the free certificate does not cover). **PROPOSED:** lowercase, map `.` `#` `_` to `-`, trim leading and trailing `-`; enforce **uniqueness of the resulting label** at claim time, first come first served (`og_dev7`, `og.dev7`, `og-dev7` collide). Alternative: refuse such usernames for this service. Add a reserved-label list (www, api, mail, admin and similar) on top of the existing username reserved list in `src/accounts/username.ts`.
3. **Released names can be re-taken.** Deleting an account currently frees its username. **PROPOSED:** quarantine a released label for about 12 months, and delete its DNS record and tunnel on release (prevents subdomain takeover).
4. **Signup order.** Today an account exists only after the user approves in their Paperclip (`src/oauth/provider.ts`, account creation at the pending-approval step), which a user with no public address cannot do. A **register-first path** is needed: username + secret key without a Paperclip link, then pay, then connect. This touches the account model and the recovery-by-approval path, and is the largest piece of v2.
5. **Changing the base domain** is not free for users: their Paperclip must accept the new hostname (a setting on their machine). Keep both hostnames live for a long overlap; keep renewing the old domain for as long as users depend on it. If the domain lapses, every user breaks at once.
6. **Shared registrable domain.** Putting users directly under `kpnsolute.com` shares cookies and reputation with other KpnWorld sites. **PROPOSED:** a dedicated domain, one level only (`name.domain`), because Cloudflare's free certificate is believed to cover only one subdomain level (**unverified**). **OPEN:** which domain.

## 7. Abuse and operations
- **One service per name:** ingress is set by us (one hostname, one local port); users cannot reconfigure it.
- **"Is it Paperclip?" check:** periodically request `/api/health` and expect the Paperclip shape (`status`, `deploymentMode`, `deploymentExposure`). A name that stops looking like Paperclip gets a warning, then suspension.
- **Suspension** is one switch (job `suspend`): remove ingress/DNS, keep the label reserved.
- Rate-limit orders and provisioning; reconcile Cloudflare state against the database on a schedule (orphaned tunnels/records are deleted).
- Refund automatically if provisioning fails.
- Idle reclaim: **PROPOSED** only after about 12 months with the tunnel offline, with notices.

## 8. Payments
Stripe Checkout (no card data on our side); orders confirmed only by a verified webhook signature; idempotent on order id; the label is held for ~15 minutes during checkout so two people cannot pay for one name. Tax and refund handling to be decided with the legal drafting.

## 9. For the later legal drafting (Subdomain Terms)
Cover: purpose limit (access address for your own Paperclip; internal use that supports a business is fine, using the name as the public face of a business or hosting other services is not); the name is a revocable licence tied to the account, not property, not transferable, one per account; our rights to suspend/reclaim for abuse or breach and to change base domains with notice; no uptime promise (depends on Cloudflare and the user's machine); refunds only if provisioning fails; conduct and impersonation/trademark rules; what metadata we keep (hostname, tunnel status, not traffic content); acceptance recorded at checkout. Needs a lawyer's review before taking payments, including sales tax.

## 10. Open questions
1. Hyphen mapping vs refusing symbol usernames?
2. 12-month quarantine and idle-reclaim periods?
3. Which domain (dedicated, one level)?
4. Open to everyone or beta only at launch?
5. Still to verify with Cloudflare's current docs: tunnels per account, DNS records per zone, certificate coverage for subdomains, per-OS service install steps.

## 11. Phases
1. **Provisioning core:** migration, provider interface + fake, job queue, home-server worker, claim/release/suspend, label rules.
2. **Register-first account path** and the Stripe order flow.
3. **Connect UX:** `/domain` page, the link on the connect screen, tunnel status in `/manage` and the plugin, docs.
4. **Hardening:** health check, suspension, reconcile, quarantine, domain-change tooling.
