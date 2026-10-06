# Manage connections (beta)

Beta accounts get a page at [`/manage`]({{URL}}/manage) where you control everything connected to your Paperclip.

## Join the beta
Tick **Join the beta** on the permission screen when you connect, or sign in at `/manage` and click **Join the beta**. You can leave the beta from the same page.

## What you can do
- **See every connected app:** its name, its access level, when it connected and when it was last used.
- **Change what an app may do.** Switch an app between **Read only** and **Full control (beta)** with one dropdown. It applies on the app's very next request, without reconnecting.
- **Disconnect an app.** It stops working immediately.
- **Appear anonymously** in the operator's logs, or switch back.
- **Make a new secret key.** The old key stops working immediately.
- **Disconnect your Paperclip.** Papercliped forgets your Paperclip key and asks your Paperclip to revoke it. Every app stops working; your account stays.
- **Delete your account.** Removes your username, stored key and all connections.

## Signing in
Use your username and secret key. Sensitive actions (new key, disconnect, delete) ask for the secret key again.

If you lost your key, connect from your AI app again and choose **Connect your Paperclip**: you keep your account and get a new key.

## Safety
- The page only ever shows your own account.
- Access can be lowered from here, and raised only between Read only and Full control. **Admin** is never granted from this page.
- The page loads no outside scripts, and sessions end after 8 hours or when you change your secret key.

## Coming next
A native Paperclip plugin that shows the same page inside your Paperclip.
