# Manage connections

Everything about your Papercliped account is managed inside Paperclip, with the [Paperclip plugin](/docs/paperclip-plugin). Link it once with your username and secret key, then:

- **See every connected app:** its name, its access level, when it connected and when it was last used.
- **Change what an app may do.** Switch between **Read only** and **Full control**. It applies on the app's very next request, without reconnecting.
- **Disconnect an app.** It stops working immediately.
- **Appear anonymously** in the service's logs, or switch back.
- **Make a new secret key, disconnect your Paperclip, or delete your account.** These ask for your secret key again.

## No plugin?
- **Disconnect an app:** remove the connector in Claude or ChatGPT, or revoke the Papercliped key in your Paperclip (it is named like "… (via bridge) (board)").
- **Change the level:** disconnect the app and connect it again, choosing the level you want.
- **Delete your account:** ask via the contact on the [Privacy](/privacy) page.

## Safety
- The plugin only ever shows your own account.
- Sensitive actions need your secret key every time.
- Developers: the plugin talks to the [Manage API](/docs/manage-api).
