# Security policy

Papercliped holds access to people's Paperclip instances, so we take reports seriously and answer quickly.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `2.x` (npm `papercliped`, `papercliped-paperclip-plugin`, and the hosted service at papercliped.co) | ✅ |
| Anything older | ❌ upgrade to the latest release |

The hosted service always runs the latest release.

## Reporting a vulnerability

**Please don't open a public issue.** Use either:

- GitHub's private reporting: **Security → Report a vulnerability** on this repository, or
- email **support@papercliped.co** with "Security" in the subject.

Include what you found, how to reproduce it, and what an attacker could do with it. Don't access other people's data, run denial-of-service tests against papercliped.co, or post details before a fix is out.

## What happens next

- We confirm we got your report within **3 days**.
- We tell you whether we can reproduce it, and our plan, within **7 days**.
- We fix it, release a new version (see [docs/RELEASING.md](docs/RELEASING.md)), and credit you in the release notes if you'd like.

## Scope

In scope: this repository's code, the npm packages built from it, and the hosted service at `papercliped.co`, `mcp.papercliped.co`, `docs.papercliped.co` and `api.papercliped.co`. Paperclip itself is a separate project: report its issues to [paperclipai/paperclip](https://github.com/paperclipai/paperclip).

The threat model, the security properties we rely on and their tests are in [docs/SECURITY.md](docs/SECURITY.md).
