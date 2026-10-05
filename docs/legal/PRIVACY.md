# Privacy Policy — Paperclip Bridge  *(TEMPLATE — replace every [PLACEHOLDER] and have it reviewed before publishing; this is not legal advice)*

**Operator:** [OPERATOR NAME / LEGAL ENTITY] · **Contact:** [PRIVACY CONTACT EMAIL] · **Effective:** [DATE]

## What the service does
Paperclip Bridge lets an AI assistant (such as Claude or ChatGPT) that **you** connect act on **your** Paperclip instance: read status and reports, and — only at the access level you choose — control agents and tasks.

## Data we handle
| Data | Why | Where / how long |
| --- | --- | --- |
| The address of your Paperclip instance | to connect to it | stored until you disconnect or the connection is revoked |
| A Paperclip access key issued when you approve the connection in your own Paperclip | to make the requests you authorised | stored **encrypted**; deleted when the connection is revoked, or automatically after [30] days without use |
| Your Paperclip user id and the AI app's name | to show and audit the connection | with the connection record |
| OAuth tokens | to authenticate the AI app to the bridge | only irreversible hashes are stored; expire in 1 hour (access) / [30] days (refresh) |
| Audit log: time, tool name, whether it changed anything, success/failure, connection id, app name, your instance host | security and abuse prevention | retained [30] days |

**Pass-through:** Content from your Paperclip (tasks, agent names, reports, etc.) is relayed to the AI app you connected so it can answer you. The bridge **does not store** that content, and does not log request arguments or responses.

We do **not** sell data, use it for advertising, or use it to train models. We do not read your Paperclip content except as needed to relay your requests.

## Your AI provider
What the AI app does with the content it receives is governed by that provider's terms and privacy policy (e.g. Anthropic, OpenAI), not this one.

## Sharing
Infrastructure providers process data on our behalf: [Render] (hosting), [Supabase] (database). No other sharing, except if required by law.

## Your choices
Disconnect in your AI app (and ask us at [PRIVACY CONTACT EMAIL] to delete the connection immediately), revoke the key named "… (via bridge, …) (board)" in your Paperclip, or both. Deleting the key in Paperclip cuts access instantly.

## Security
See our security practices at [LINK TO docs/SECURITY.md]. No system is perfectly secure; if we learn of a breach affecting you we will tell you promptly and help you revoke keys.

## Children
Not intended for anyone under [18].

## Changes
We will post changes here and update the date above.
