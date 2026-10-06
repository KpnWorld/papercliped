# Permissions

You decide how much the AI may do each time you connect. The levels build on each other.

| Level | What the AI can do |
| --- | --- |
| **Read only** (default) | View agents, tasks, goals, costs and reports. Cannot change anything. |
| **Full control (beta)** | Everything above, plus pause, resume or wake agents, create and update issues and goals, and comment. |
| **Admin (advanced)** | Everything above, plus decide approvals, change budgets, terminate agents and send arbitrary API requests. Only offered when the app asks for it. |

## Good to know
- Papercliped enforces these levels itself on every call, and refuses anything outside the level you chose.
- Your Paperclip key has the access your Paperclip account has. The levels limit what the **AI app** can do through Papercliped; they do not shrink the key itself. That is why the key is stored encrypted and why you can revoke it at any time.
- The AI asks for confirmation before destructive actions.
- To change a level, disconnect the app and connect it again, then choose the new level.

## Disconnecting
- Remove the connector in Claude or ChatGPT.
- To cut access immediately, revoke the key in your Paperclip (it is named like "… (via bridge) (board)").
- To delete your account and stored key, ask via the contact on the [Privacy](/privacy) page.
