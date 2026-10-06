# Privacy Policy

**Operator:** KpnWorld ("we") · **Contact:** {{CONTACT}} · **Effective:** {{DATE}}

*This policy describes how the hosted Papercliped service at {{URL}} handles data. It is a good-faith summary of what the software does; the operator should have it reviewed before relying on it as a legal document.*

## What the service does
Papercliped lets an AI assistant (such as Claude or ChatGPT) that **you** connect act on **your** Paperclip: read status and reports and, only at the access level you choose, control agents and tasks.

## What we publish
The service publishes **aggregate numbers only** at `/api/public/v1/*` and on the status page: totals and rates (users, live connections, sign-in success, request success rate, latency, error types, load). Nothing in them identifies you: no usernames or aliases, no Paperclip addresses, no app names, no IP addresses, and no per-person breakdown.

## Data we handle
| Data | Why | How it is kept |
| --- | --- | --- |
| Your **username** | to identify your account and to run the service | stored with your account; shown only in the operator's logs and private dashboard (see Anonymous mode below) |
| Your **secret key** | to let you sign in again | only a salted one-way hash is stored; we cannot read or recover it |
| The address of your Paperclip | to connect to it | stored until you disconnect or delete your account |
| A Paperclip access key, issued when **you** approve in your own Paperclip | to make the requests you authorised | stored **encrypted**; deleted when you disconnect, or after 30 days without use |
| Your Paperclip user id and the AI app's name | to recognise you when you reconnect, and to show the connection | with your account and connection records |
| OAuth tokens | to authenticate the AI app to the service | only irreversible hashes are stored; access tokens last 1 hour |
| Activity log: time, tool name, whether it changed anything, success or failure, timing, app name, your Paperclip's host | security, abuse prevention and measuring reliability | kept 30 days |
| Community log: when an account joins, signs in, updates or leaves, and whether sign-in flows succeed | to measure how the service is doing | kept with the activity log |
| Service health samples | to detect outages | kept short-term, contain no personal data |

**Pass-through:** content from your Paperclip (tasks, agent names, reports) is relayed to the AI app you connected so it can answer you. The service **does not store** that content and does not log request arguments or responses.

We do **not** sell data, use it for advertising, or use it to train models.

## Anonymous mode
You can choose to appear anonymously. Your username is then replaced in the logs and the operator's dashboard by a generated alias (for example `Ann02`), and your Paperclip's address by a masked label. Turning it on also replaces your name in earlier log entries. This is **pseudonymity, not secrecy from the operator**: a person with administrator access to the database can still link an alias to an account. It does protect you from anyone who only sees the panel or the logs.

## Your AI provider
What the AI app does with the content it receives is governed by that provider's terms and privacy policy (for example Anthropic or OpenAI), not this one.

## Sharing
Infrastructure providers process data on our behalf: Render (hosting), Supabase (database) and Cloudflare (DNS and keep-alive). No other sharing, except where required by law.

## Your choices
- Disconnect in your AI app, and ask us to delete your account at {{CONTACT}} to remove it immediately.
- Revoke the access key in your own Paperclip (named like "… (via bridge) (board)"). That cuts access instantly.
- Switch anonymous mode on or off whenever you sign in.

## Security
See [Security](/docs/security). No system is perfectly secure; if we learn of a breach affecting you we will tell you promptly and help you revoke keys.

## Children
Not intended for anyone under 18.

## Changes
We will post changes here and update the date above.
