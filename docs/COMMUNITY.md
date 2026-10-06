# Community plan

Status: the website's community page is live; the accounts below are **not created yet**. Links appear on the site only once their URL is set (`web/src/config/community.ts`, or `VITE_DISCORD_URL`, `VITE_X_URL`, `VITE_DISCUSSIONS_URL`, `VITE_FORUM_URL` at build time).

## Forum
- **Start with GitHub Discussions** (free, no hosting, same login as issues). Enable it in the repository settings, then set `VITE_DISCUSSIONS_URL` and `VITE_FORUM_URL` to `https://github.com/OpenSourcx/papercliped/discussions`; `forum.papercliped.co` can redirect there (see the hosts work in the website plan).
- **Later options:** Discourse (best features, but needs a server with a few GB of RAM; Render's free tier can't run it) or Flarum (lighter PHP app). Both cost hosting money and moderation time; revisit when Discussions gets busy.

## Discord blueprint (no bots needed)
- **Channels:** `#welcome` (read-only rules + links), `#announcements` (read-only, releases), `#general`, `#help`, `#ideas`, `#show-and-tell`, `#paperclip-plugin`, `#self-hosting`, `#contributors`.
- **Roles:** Maintainer, Contributor, Member (default). Only maintainers post in announcements.
- **Rules:** the code of conduct (`CODE_OF_CONDUCT.md`), plus: no secret keys/tokens in chat, security reports by email, no self-promotion outside show-and-tell.
- **Welcome message:** "Welcome to Papercliped! Start at https://papercliped.co/docs. Ask in #help, share ideas in #ideas. Never post your secret key or tokens. Code of conduct: https://github.com/OpenSourcx/papercliped/blob/main/CODE_OF_CONDUCT.md"
- Turn on Community features (rules screening, verified email) and keep the invite link non-expiring once you set `VITE_DISCORD_URL`.

## Social
Create the X account first, then set `VITE_X_URL`. Post releases from the changelog feed (`/changelog.xml`).
