# Paperclip plugin

The Papercliped plugin is where you manage Papercliped, right inside Paperclip: a **Papercliped** entry in the sidebar and a page where you see every connected AI app, switch each between **Read only** and **Full control**, disconnect apps, turn anonymity on or off, and look after your account.

It manages your Papercliped account only. It never reads or controls your Paperclip itself, and AI apps still connect through Papercliped as before.

## Install (Paperclip admin)
**Automatic (recommended).** When you connect your Paperclip from an AI app, the address step has a box, ticked by default: **Also install the Papercliped plugin in my Paperclip**. After you approve the sign-in, Papercliped asks your Paperclip to install it using Paperclip's own installer and your own approved key. It installs one fixed package, `papercliped-paperclip-plugin`, at the exact version that matches the service, and only when you are the Paperclip's instance admin. If you are not an admin, if it is already installed, or if your Paperclip can't install plugins, nothing happens and your connection works as usual. Untick the box to skip it.

**By hand.** Install the npm package `papercliped-paperclip-plugin` from **Settings → Plugins** in Paperclip (instance admin only). You can remove it there at any time, whichever way it was installed.

The plugin asks for these capabilities: store its own data, make outbound web requests (to Papercliped), and add a sidebar entry and a page.

The bridge address defaults to `https://papercliped.co`. If you host your own bridge, change **Papercliped bridge URL** in the plugin's settings. It must be `https`.

## Link your account
1. In Paperclip, open **Papercliped** in the sidebar.
2. Enter the **username** and **secret key** you got when you first connected Claude or ChatGPT, and click **Link**.

Papercliped checks the key once and hands the plugin a link token. The key itself is not stored in Paperclip. Each person in your Paperclip links their own Papercliped account; one person's link is never used for another.

Lost your secret key? Connect from your AI app again and choose **Connect your Paperclip**: you keep your account and get a new key.

## What you can do
- **Connected apps:** see each app's level and when it was last used, switch it between Read only and Full control (it applies on the app's next request), or disconnect it.
- **Privacy:** appear anonymously in the service's logs, or switch back.
- **Linked Paperclips:** see every Paperclip linked to your account, unlink this one, or remove an old one.
- **Account** (asks for your secret key again):
  - **Make a new secret key.** Shown once. The old key stops working and other linked Paperclips have to link again; this one stays linked.
  - **Disconnect my Paperclip.** Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every app stops working and the plugin unlinks. Your account stays.
  - **Delete my account.** Removes your username, stored key and every connection. Type your username to confirm.

## Good to know
- The plugin runs as trusted code inside Paperclip, so install it only from the official package. The automatic install is limited to that one package and to the version that matches the service, and it is always your choice on the connect screen.
- The link token stays on your Paperclip server and is never shown on the page. It can only manage your account: it can't call any Paperclip tool.
- There is no separate website page for this any more; the old `/manage` address points here.
