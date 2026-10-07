# Troubleshooting

**"Could not reach your Paperclip."** The address must be a public `https://` address on port 443 that answers over the internet. Test it with `curl https://your-paperclip/api/health`. A challenge page from a firewall or bot protection in front of Paperclip will block Papercliped; exempt `/api/*`. Step-by-step help with tunnels and domains: [Set up your Paperclip](/docs/connect-your-paperclip).

**The first request is slow.** The hosted service runs on a free tier and may need up to a minute to wake after a restart. Retry once.

**"Invalid or expired" when connecting.** The sign-in page is time-limited. Start the connection again from your AI app.

**I lost my secret key.** Choose **Connect your Paperclip** on the sign-in page and approve in Paperclip. You keep your account and can create a new key.

**The AI says it can't change anything.** You connected with **Read only**. Disconnect and connect again, choosing **Full control**.

**The AI says a tool isn't available, or a call was blocked.** Check the access switch, the agent's setting and the session's limits in the [control room](/docs/control-room). The message the AI gets says which one. **Activity** lists blocked calls with the reason.

**The control room shows no agents.** Open a company first: agents are listed for the company you're in. If you installed an older version of the plugin, remove it in **Settings → Plugins** and install it again so it can read agents.

**My username is rejected.** It needs 6 to 32 characters including at least one number or one of `.` `#` `_`, and only letters, numbers and those symbols. It may also be taken.

**Still stuck?** Open an issue at https://github.com/OpenSourcx/papercliped/issues. Never include your secret key or Paperclip keys.
