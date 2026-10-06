# Security

What Papercliped does to protect you, and what it cannot.

## What is stored
- Your Paperclip access key, **encrypted** with a key that never touches the database.
- Your secret key as a salted one-way hash. We cannot read it.
- OAuth tokens as irreversible hashes.
- Activity and community logs (no request contents, no responses).

## Protections
- **Scopes are enforced on the server.** Every call is checked against the level you chose.
- **Your Paperclip is treated as untrusted.** Papercliped connects only to public `https://` addresses, checks the resolved address on every connection, refuses redirects and private networks, and limits response size and time.
- **OAuth 2.1 with PKCE**, short-lived access tokens, rotating refresh tokens with reuse detection.
- **Rate limits** on sign-in, secret-key attempts and tool calls.
- **A separate operator panel** reads the database through a read-only role that can see only safe views: never your key, secret hash or an anonymous account's real name.
- Revocation is immediate on disconnect, and idle keys are removed after 30 days.

## What it cannot do
- Your Paperclip key carries your account's full power; the levels limit the AI app, not the key. Prefer a dedicated Paperclip account, and revoke the key in Paperclip if unsure.
- If the service itself were compromised, an attacker could use stored keys until you revoke them. Revoking in Paperclip always works.
- This is a beta and has not had an independent security audit.

## Reporting a problem
Report vulnerabilities privately through the contact on the [Privacy](/privacy) page, or via a private GitHub security advisory on the `OpenSourced/papercliped` repository. Please do not post exploits publicly.
