# Any AI app (MCP)

Papercliped is a standard **MCP server**, so it works with more than Claude. Pick the way that matches your app.

## Apps that can add a remote MCP server with sign-in (OAuth)
Most current AI apps and editors can. Add a remote (Streamable HTTP) MCP server with this address:
```
{{MCP}}/mcp
```
The app opens the Papercliped sign-in page. Choose **Connect your Paperclip** (or **Log in** if you have an account), approve in your Paperclip, and pick **Read only** or **Full control (beta)**. Papercliped supports OAuth 2.1 with dynamic client registration and PKCE, which is what these apps use.

Where the setting lives differs per app (often "Connectors", "MCP servers" or "Tools"). Check your app's own docs for the menu.

## Apps that only run local MCP servers
Run Papercliped on your own computer instead. It talks straight to your Paperclip, with no account needed:
```
npx papercliped@latest
```
Set `PAPERCLIP_API_URL` (your Paperclip's address) and `PAPERCLIP_API_KEY` (a Paperclip board token) in the app's MCP server settings. This also works for a Paperclip that is only on your own network.

## Apps that need a fixed API key instead of sign-in
Self-host the bridge with a static key (`BRIDGE_TOKEN`) and send it as `Authorization: Bearer <key>`. See the README in the GitHub repository ("Three ways to run it").

## ChatGPT
Use the custom MCP connector where your plan offers it, or GPT Actions with `{{MCP}}/openapi.json`. See [ChatGPT setup](/docs/chatgpt).

## What every app gets
The same tools everywhere: list and control agents, issues, goals and approvals, sync what changed, and reports on status, costs, agent performance and activity. What an app may change depends on the level you chose; you can change it at any time on the [manage page]({{URL}}/manage).
