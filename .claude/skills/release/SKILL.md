---
name: release
description: Version, describe and ship every push. Use before EVERY commit you push to main (code, docs or config) — it decides Major.Minor.Patch, bumps every version string with scripts/version.mjs, writes the changelog entry and the commit description that become the release notes, and checks CI publishes it. Also use when setting up the same release flow in a new repository.
---

# Release: every push is a version

Every push to `main` ships as a release. CI (`.github/workflows/release.yml`) reads the version in `package.json`; if `v<version>` isn't tagged yet it tests, publishes the npm packages, tags that exact commit and creates the GitHub release. So **every push carries a new version**, and the commit description is what people read.

## 1. Pick the bump (Major.Minor.Patch)

Look at what the push changes for someone **using** the project (AI-app users, self-hosters, plugin installers, API callers). Take the highest that applies:

| Bump | When | Examples |
| --- | --- | --- |
| **Major** `X.0.0` | Someone must change something or something they rely on stops working | removing or renaming a tool, scope, endpoint, env var, CLI flag or config key; a migration that can't be rolled back; changing what an access level allows in a way that removes access; dropping a Node version |
| **Minor** `x.Y.0` | New capability, nothing breaks | a new tool, endpoint, page, plugin action, option or docs section; an old name kept working as an alias |
| **Patch** `x.y.Z` | Fixes and everything else | bug and security fixes, copy and docs edits, styling, refactors, tests, CI, dependency bumps |

Rules: a security fix is Patch unless it forces users to act (then Major). Unsure between two → take the higher. Never reuse or go back on a version; npm refuses it and the tag would point at the wrong commit.

## 2. Write it down first

Add the user-facing story under `## Unreleased` at the top of `CHANGELOG.md`, one bullet per change, starting with a bold phrase:

```md
## Unreleased

- **Docs search finds headings.** Searching "anonymous" now jumps to the Anonymous mode section.
- **Fixed:** the plugin's level dropdown showed Read only after switching to Full control.
```

Write for users: what changed and what they need to do, not which files moved.

## 3. Bump every version string

```sh
node scripts/version.mjs <major|minor|patch> "<short release title>"
node scripts/version.mjs check
```

The script reads `.release.json`, updates every listed file (here: `package.json`, `plugin/package.json`, `.claude-plugin/plugin.json`, `plugin/src/manifest.ts`, both lockfiles), turns `## Unreleased` into `## vX.Y.Z — <title>` with a fresh empty `## Unreleased` above it, and records the date for the website changelog. It refuses an empty `## Unreleased`.

## 4. Commit: the description is the release note

```
vX.Y.Z: <what this release does, in plain words>

<Why, in one or two sentences.>

- <user-facing change>
- <user-facing change>

<Anything users must do: "Reconnect Claude", "Run the migration", or "Nothing to do".>
```

Then the repository's own commit trailers. One release per push: if you have several commits, bump once in the last one and describe them all there.

## 5. Before pushing

Run the checks CI runs (here: `npm run build && npm test`, `npm --prefix plugin test`, `npm --prefix web test`, `node scripts/check-packages.mjs`). If CI fails before anything was published, fix it and push again with the same version.

## 6. After pushing

Watch the **Release** workflow for that commit. Success = both packages on npm at the new version, tag `vX.Y.Z` on the commit, GitHub release with the notes. If it fails before "Publish", fix and push again (same version). If one package published and the other didn't, re-run the workflow: published versions are skipped and the tag is made last.

## Adopting this in another repository

1. Copy `scripts/version.mjs` and write a `.release.json` listing that repo's version files (`kind: "json"` for a top-level `version`, or `kind: "regex"` with a `pattern` whose first group is the version), lockfiles, changelog and optional dates file.
2. Copy `.github/workflows/release.yml` and change the build, test and publish steps to that repo's.
3. On npmjs.com, add a trusted publisher for each package: the GitHub owner, repository and `release.yml`.
4. Copy this skill to `.claude/skills/release/SKILL.md` and `.agents/skills/release/SKILL.md`, and point to it from `CLAUDE.md` and `AGENTS.md`.
