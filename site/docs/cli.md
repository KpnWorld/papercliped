# Command line

Papercliped installs these commands (`npx -p papercliped@latest <command>`, or from a clone after `npm run build`).

| Command | What it runs |
| --- | --- |
| `papercliped` | The MCP server over stdio, for one Paperclip (local use) |
| `papercliped-bridge` | The HTTP bridge (MCP over HTTP, ChatGPT Actions, OAuth, the public site and APIs) |
| `papercliped-admin` | Operator commands, below |

## papercliped-admin
Run it with the same environment as the bridge (it reads the same database).

| Command | What it does |
| --- | --- |
| `migrate` | Apply database migrations |
| `schema-sql` | Print the full schema as one SQL script (for pasting into Supabase) |
| `users` | List accounts: name, anonymity, status, last sign-in |
| `delete-user <username>` | Delete an account and everything tied to it |
| `grants` | List live connections |
| `revoke <grant id>` | Disconnect one connection |
| `revoke-all --yes` | Disconnect every connection |
| `sweep` | Revoke connections idle longer than `BRIDGE_IDLE_REVOKE_DAYS` |
| `rotate-keys` | Re-seal stored Paperclip keys with the current `BRIDGE_SECRET` (after rotating it) |

## npm scripts (in a clone)
`npm test`, `npm run build`, `npm run start:http`, `npm run start:stdio`, `npm run openapi` (writes `openapi.json`), `npm run migrate`, `npm run schema:sql`.
