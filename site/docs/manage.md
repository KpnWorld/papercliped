# Manage connections (beta)

Beta accounts get a page at [`/manage`]({{URL}}/manage) where you control everything connected to your Paperclip.

## Join the beta
Tick **Join the beta** on the permission screen when you connect, or sign in at `/manage` and click **Join the beta**. You can leave the beta from the same page.

## What you can do
- **See every connected app:** its name, its access level, when it connected and when it was last used.
- **Change what an app may do.** Switch an app between **Read only** and **Full control** with one dropdown. It applies on the app's very next request, without reconnecting.
- **Disconnect an app.** It stops working immediately.
- **Appear anonymously** in the operator's logs, or switch back.
- **Make a new secret key.** The old key stops working immediately.
- **Link the Paperclip plugin.** Click **Link Paperclip plugin** to get a one-time code, then paste it into the Papercliped page inside Paperclip. See [Paperclip plugin](/docs/paperclip-plugin).
- **Disconnect your Paperclip.** Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every app stops working; your account stays.
- **Delete your account.** Removes your username, stored key and all connections.

## Signing in
Use your username and secret key. Sensitive actions (new key, disconnect, delete) ask for the secret key again.

If you lost your key, connect from your AI app again and choose **Connect your Paperclip**: you keep your account and get a new key.

## Safety
- The page only ever shows your own account.
- Each app is either Read only or Full control; switch between them here.
- The page loads no outside scripts, and sessions end after 8 hours or when you change your secret key.

## Paperclip plugin links
Each link is listed under **Paperclip plugin** with an **Unlink** button. A plugin link can manage connections and privacy only. It can't read or control your Paperclip, make link codes, or do anything that asks for your secret key. Making a new secret key unlinks every plugin; link again with a fresh code.
