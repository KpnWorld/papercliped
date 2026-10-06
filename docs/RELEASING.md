# Releasing

Two npm packages ship from one tag: `papercliped` (the bridge, repo root) and `papercliped-paperclip-plugin` (`plugin/`). Publishing uses **npm trusted publishing** (OIDC) from `.github/workflows/release.yml`: no npm token is stored in GitHub, and provenance is attached automatically.

Requirements: the repository is public, the workflow runs on GitHub-hosted runners, and GitHub Actions is enabled (and billable, if needed) for the `OpenSourcx` organization.

## One-time setup (npmjs.com)
1. Publish the first version of each package by hand, with 2FA (a package must exist before trusted publishing can be configured):
   ```sh
   npm login
   npm publish --tag beta --otp=<code>                          # papercliped, from the repo root
   npm --prefix plugin ci && npm --prefix plugin run build
   (cd plugin && npm publish --tag beta --otp=<code>)           # papercliped-paperclip-plugin
   ```
2. For **each** package on npmjs.com: open the package → **Settings** → **Trusted publishing** → **GitHub Actions** and enter:
   - Organization or user: `OpenSourcx`
   - Repository: `papercliped`
   - Workflow filename: `release.yml`
   - Allow `npm publish`
3. For each package, set **Publishing access** to *Require two-factor authentication and disallow tokens*, then revoke any old automation tokens.

`repository.url` in both `package.json` files must stay exactly `git+https://github.com/OpenSourcx/papercliped.git` (npm checks it against the workflow's repository), and `publishConfig` must stay `{ "access": "public" }`.

## Each release
1. Bump `version` in `package.json` and `plugin/package.json` (they must match the tag), and add a `## vX.Y.Z[-beta.N]` section to `CHANGELOG.md`.
2. Commit to `main` and let CI pass.
3. Tag and push:
   ```sh
   git tag vX.Y.Z-beta.N
   git push origin vX.Y.Z-beta.N
   ```

The workflow then: checks the tag equals both package versions, installs, builds and tests the root and the plugin, publishes `papercliped` and `papercliped-paperclip-plugin` (tag contains `-` → `--tag beta`, otherwise `latest`), and creates the GitHub release with that version's changelog section (marked pre-release for `-` tags). The plugin step is skipped if that plugin version is already on npm, and an existing GitHub release is left alone. If the root version is already on npm, the run fails: bump the version and tag again.
