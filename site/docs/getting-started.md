# Getting started

Papercliped connects Claude (and ChatGPT) to **your** Paperclip. You keep control: you choose how much the AI may do, and you can cut access at any time.

## What you need
- A Paperclip that is reachable over the internet at an `https://` address (for example `https://workforce.example.com`). Private, local and `http://` addresses are refused on purpose. No public address yet? See [Set up your Paperclip](/docs/connect-your-paperclip).
- A Claude account that can add connectors, or Claude Code.

## Connect from Claude
1. In Claude open **Settings → Connectors → Add custom connector**.
2. Use the address `{{URL}}/mcp` and click **Connect**.
3. On the Papercliped page choose **Connect your Paperclip**, enter your Paperclip's address, and approve the request in your Paperclip.
4. Pick a **username** (see below). Papercliped then shows your **secret key once**. Save it in a password manager.
5. Choose how much to allow (see [Permissions](/docs/permissions)) and click **Allow**.
6. Ask Claude something like "List my Paperclip agents."

## Claude Code
```
claude mcp add --transport http papercliped {{URL}}/mcp
```
Or install the plugin: `/plugin marketplace add OpenSourcx/papercliped`, then `/plugin install papercliped@papercliped`.

## Run it yourself (npm)
```
npx papercliped@beta
```
This starts a local server for one Paperclip, using `PAPERCLIP_API_URL` and `PAPERCLIP_API_KEY`.

## ChatGPT
Papercliped publishes an OpenAPI description at `{{URL}}/openapi.json` for GPT Actions. See [ChatGPT setup](/docs/chatgpt).

See [Create your account](/docs/signup) for every screen in detail.

## Your username
- 6 to 32 characters.
- At least one number or one of these symbols: `.` `#` `_`.
- Letters, numbers and only those three symbols. Every username is unique.

## Signing in again
- **With your secret key:** enter your username and secret key.
- **Without it:** choose **Connect your Paperclip** and approve again. Papercliped recognises you as the same Paperclip user, signs you back in to the same account, and lets you make a new secret key.
