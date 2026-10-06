# Permissions

You decide how much the AI may do each time you connect. There are two levels.

| Level | What the AI can do |
| --- | --- |
| **Read only** (default) | View agents, tasks, goals, costs and reports. Cannot change anything. |
| **Full control** | Every tool: everything above, plus pause, resume, wake or terminate agents, create and update issues and goals, comment, decide approvals, change budgets and send any API request. Run your Paperclip from anywhere, without opening the dashboard. |

## Good to know
- Papercliped enforces these levels itself on every call, and refuses anything outside the level you chose.
- Your Paperclip key has the access your Paperclip account has. The levels limit what the **AI app** can do through Papercliped; they do not shrink the key itself. That is why the key is stored encrypted and why you can revoke it at any time.
- The AI asks for confirmation before actions that can't be undone, such as terminating an agent.
- Apps that still ask for the old "admin" level get Full control.
- To change a level, use the [Paperclip plugin](/docs/paperclip-plugin), or disconnect the app and connect it again.

## Disconnecting
- Remove the connector in Claude or ChatGPT.
- To cut access immediately, revoke the key in your Paperclip (it is named like "… (via bridge) (board)").
- To delete your account and stored key, ask via the contact on the [Privacy](/privacy) page.
