# FAQ

## Is Papercliped free?
Yes. It's free and open source under the MIT licence. The hosted bridge at papercliped.co runs the same code you can run yourself.

## Is it made by Paperclip?
No. Papercliped is an independent community project that uses Paperclip's public API.

## What does the AI see?
Only what it asks for through the tools, within your level. Issue and comment text written by agents can reach the AI; treat it as data, not instructions.

## What do you store?
Your username, a hash of your secret key, your Paperclip's address, an encrypted Paperclip key, connection records and a 30-day activity log. Details in [Privacy](/privacy).

## Can I use it without a public Paperclip?
Yes: run it locally with `npx papercliped@latest`. The hosted bridge needs a public https address; see [Set up your Paperclip](/docs/connect-your-paperclip).

## Why does pausing an agent fail with 403?
Pause, resume, wake and approve need a Paperclip **board** token, and a connection at **Full control**. Check your level in the [Paperclip plugin](/docs/paperclip-plugin).

## How do I stop it?
Disconnect the app on the manage page, revoke the key in your Paperclip, or delete your account. It stops at once.

## I lost my secret key.
Choose **Connect your Paperclip** when signing in and approve in Paperclip: you keep your account and can make a new key.

## Does it work with ChatGPT?
Yes, through ChatGPT's MCP connectors or GPT Actions. See [ChatGPT setup](/docs/chatgpt).

## Where do I report a bug or suggest something?
On GitHub: [open an issue](https://github.com/OpenSourcx/papercliped/issues), or use the community page on papercliped.co. Security problems go privately to support@papercliped.co.
