# Anonymous mode

Papercliped keeps a small activity log so the operator can see how the service is doing: who joined, signed in, updated or left, and how reliable it is.

By default the log shows your **username**. If you prefer, tick **Appear anonymously** on the permission screen. Then:
- your username is shown as a generated alias such as `Ann02`;
- your Paperclip's address is replaced by a masked label;
- earlier log entries are rewritten to the alias too, and switching it off restores your name.

## What it does not do
Anonymous mode is **pseudonymity**, not secrecy from the operator. Someone with administrator access to the database can still link an alias to an account. It hides you from anyone who only sees the logs or the operator panel, which cannot read real usernames of anonymous accounts.

## Example log lines
```
09:25:30 og.kpnwrld - joined cliped
09:26:02 Ann02 - updated cliped
09:31:48 Ann02 - left cliped
```
