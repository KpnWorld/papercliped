# Troubleshooting

**"Could not reach your Paperclip."** The address must be a public `https://` address on port 443 that answers over the internet. Test it with `curl https://your-paperclip/api/health`. A challenge page from a firewall or bot protection in front of Paperclip will block Papercliped; exempt `/api/*`. Step-by-step setup for every host: [Host your Paperclip](/docs/hosting).

**"This hostname is not allowed for this Paperclip instance."** Paperclip doesn't recognise the address. Set `PAPERCLIP_DEPLOYMENT_EXPOSURE=public` and `PAPERCLIP_PUBLIC_URL` to exactly the address you use, then restart Paperclip. See [What every option needs](/docs/hosting#what-every-option-needs).

**It stopped working after about a month.** Newer Paperclip versions make keys approved through the sign-in prompt expire after 30 days. When the AI says the Paperclip credential was rejected, disconnect and connect again from your AI app, then approve in Paperclip.

**Agents stop mid-task now and then.** Something restarted Paperclip: an update, a redeploy, or a host that sleeps. Runs in progress end on every restart. Use an always-on host and update when agents are idle.

**The first request is slow.** The hosted service runs on a free tier and may need up to a minute to wake after a restart. Retry once.

**"Invalid or expired" when connecting.** The sign-in page is time-limited. Start the connection again from your AI app.

**I lost my secret key.** Choose **Connect your Paperclip** on the sign-in page and approve in Paperclip. You keep your account and can create a new key.

**The AI says it can't change anything.** You connected with **Read only**. Disconnect and connect again, choosing **Full control**.

**My username is rejected.** It needs 6 to 32 characters including at least one number or one of `.` `#` `_`, and only letters, numbers and those symbols. It may also be taken.

**Still stuck?** Open an issue at https://github.com/OpenSourcx/papercliped/issues. Never include your secret key or Paperclip keys.
