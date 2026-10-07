# Releasing

Two npm packages ship from one version: `papercliped` (the bridge, repo root) and `papercliped-paperclip-plugin` (`plugin/`). Publishing uses **npm trusted publishing** (OIDC) from `.github/workflows/release.yml`: no npm token is stored in GitHub, and provenance is attached automatically.

Requirements: the repository is public, the workflow runs on GitHub-hosted runners, and GitHub Actions is enabled (and billable, if needed) for the `OpenSourcx` organization.

## One-time setup (npmjs.com)
Trusted publishing can only be configured on a package that already exists.

**State as of v2.1.0:** both packages exist on npm (`papercliped` 1.1.0-beta.2, `papercliped-paperclip-plugin` 2.0.0), so step 1 is done. `papercliped-paperclip-plugin@2.0.0` predates the move of account management into the plugin and links with the old one-time codes, which the bridge no longer accepts: v2.1.0 replaces it. Do step 2 for the plugin before tagging if you want the workflow to publish it; otherwise publish 2.1.0 by hand and the workflow skips it.

1. Publish the first version by hand, with 2FA (the plugin needs Node 24.11 or newer):
   ```sh
   npm login
   npm --prefix plugin ci
   cd plugin && npm publish --otp=<code>        # builds first (prepublishOnly); publishes papercliped-paperclip-plugin@2.0.0
   ```
   If you publish the plugin by hand at 2.0.0, the release run skips it (that version already exists) and publishes only `papercliped`.
2. For **each** package on npmjs.com: open the package → **Settings** → **Trusted publishing** → **GitHub Actions** and enter:
   - Organization or user: `OpenSourcx`
   - Repository: `papercliped`
   - Workflow filename: `release.yml`
   - Allow `npm publish`
3. For each package, set **Publishing access** to *Require two-factor authentication and disallow tokens*, then revoke any old automation tokens.

`repository.url` in both `package.json` files must stay exactly `git+https://github.com/OpenSourcx/papercliped.git` (npm checks it against the workflow's repository), and `publishConfig` must stay `{ "access": "public" }`.

## The website
The website (`web/`) is **not** in the npm package. The Docker image builds it (a separate stage) and the bridge serves it from `/app/web/dist`. The npm package's `papercliped-bridge` serves its built-in Markdown pages instead, unless you point `WEB_DIST` at a built copy (`npm --prefix web ci && npm --prefix web run build`).

## Each release
Releases are automatic: **every push to `main` whose version isn't released yet becomes a release.** Nobody pushes tags.

1. Add what changed under `## Unreleased` in `CHANGELOG.md`, then run `node scripts/version.mjs <major|minor|patch> "<title>"`. It bumps every file listed in `.release.json` (`package.json`, `plugin/package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `plugin/src/manifest.ts`, the lockfiles), turns `## Unreleased` into `## vX.Y.Z — <title>` and records the date. Which number to bump, and how to write the commit description, is in the release skill (`.agents/skills/release/SKILL.md`).
2. Push to `main`.

On every push to `main`, `.github/workflows/release.yml` reads the version. If the tag `vX.Y.Z` already exists it stops (an ordinary commit). Otherwise it checks that every version string and the changelog section agree, builds and tests the root and the plugin, packs and installs both packages as a user would (`scripts/check-packages.mjs`), publishes `papercliped` and `papercliped-paperclip-plugin` (a version with `-`, like `2.2.0-beta.1`, goes to the `beta` dist-tag, otherwise `latest`), and only then creates the tag `vX.Y.Z` on that exact commit together with the GitHub release, whose notes are the changelog section followed by every commit description since the previous release. A push that doesn't bump the version ships nothing and gets a warning in the run. Each publish step skips a version already on npm, and the tag is made last, so a failed run can be re-run from the Actions tab (or with **Run workflow**) once the cause is fixed.
