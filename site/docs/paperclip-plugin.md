# Paperclip plugin (beta)

The Papercliped plugin puts the connection manager inside Paperclip: a **Papercliped** entry in the sidebar and a page where you can see connected apps, switch each between **Read only** and **Full control (beta)**, disconnect them, and turn anonymity on or off.

It manages your connections only. It never reads or controls your Paperclip, and the AI apps still connect through Papercliped as before.

## Install (Paperclip admin)
Install the npm package `papercliped-paperclip-plugin` from **Settings → Plugins** in Paperclip. Installing is done by the person who runs the Paperclip instance, never remotely. The plugin asks for these capabilities: store its own data, make outbound web requests (to Papercliped), and add a sidebar entry and a page.

The bridge address defaults to `https://papercliped.kpnsolute.com`. If you host your own bridge, change **Papercliped bridge URL** in the plugin's settings. It must be `https`.

## Link your account
1. Sign in at [`/manage`]({{URL}}/manage) and join the beta if you haven't.
2. Click **Link Paperclip plugin** and copy the code (looks like `pcl_AB12C-DE34F`).
3. In Paperclip, open **Papercliped** in the sidebar, paste the code under **Link account**, and click **Link**.

The code works once and expires after 10 minutes. Each person in your Paperclip links their own Papercliped account; one person's link is never used for another.

## Unlink
Click **Unlink** in the plugin, or **Unlink** under **Paperclip plugin** at `/manage`. The link stops working immediately. Making a new secret key also unlinks every plugin.

## What the plugin can't do
Make a new secret key, disconnect your Paperclip, delete your account, make link codes, or change the beta: those need you at `/manage` with your secret key.

## Good to know
- The plugin runs as trusted code inside Paperclip, so install it only from the official package.
- The link token stays on your Paperclip server. It is never shown on the page.
