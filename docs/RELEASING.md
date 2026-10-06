# Releasing

Two npm packages ship from one tag: `papercliped` (the bridge, repo root) and `papercliped-paperclip-plugin` (`plugin/`). Publishing uses **npm trusted publishing** (OIDC) from `.github/workflows/release.yml`: no npm token is stored in GitHub, and provenance is attached automatically.

Requirements: the repository is public, the workflow runs on GitHub-hosted runners, and GitHub Actions is enabled (and billable, if needed) for the `OpenSourcx` organization.

## One-time setup (npmjs.com)
Trusted publishing can only be configured on a package that already exists.

**State as of v2.0.0:** `papercliped` already exists on npm (you published 1.1.0-beta.2), so skip step 1 for it. `papercliped-paperclip-plugin` does **not** exist yet, so publish it by hand once (step 1) **before** pushing the `v2.0.0` tag; otherwise the plugin step in the release run fails.

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
1. Bump `version` in `package.json`, `plugin/package.json`, `plugin/src/manifest.ts` and `.claude-plugin/plugin.json` (they must match the tag; `test/versions.test.ts` checks it), and add a `## vX.Y.Z[-beta.N]` section to `CHANGELOG.md`.
2. Commit to `main` and let CI pass.
3. Tag and push:
   ```sh
   git tag vX.Y.Z-beta.N
   git push origin vX.Y.Z-beta.N
   ```

The workflow then: checks the tag equals both package versions, installs, builds and tests the root and the plugin, packs and installs both packages as a user would (`scripts/check-packages.mjs`), publishes `papercliped` and `papercliped-paperclip-plugin` (tag contains `-` → `--tag beta`, otherwise `latest`), and creates the GitHub release with that version's changelog section (marked pre-release for `-` tags). The plugin step is skipped if that plugin version is already on npm, and an existing GitHub release is left alone. If the root version is already on npm, the run fails: bump the version and tag again.
