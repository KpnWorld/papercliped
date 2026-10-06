# Fonts

Self-hosted so the site makes no third-party requests. Latin subset only. All three are licensed under the SIL Open Font License 1.1 (licence texts in this folder).

| File | Family | Source |
| --- | --- | --- |
| `bricolage-grotesque-latin-wght-normal.woff2` | Bricolage Grotesque (variable, weight 200–800): headlines and the wordmark | `@fontsource-variable/bricolage-grotesque` |
| `inter-latin-wght-normal.woff2` | Inter (variable, weight 100–900): body and interface | `@fontsource-variable/inter` |
| `jetbrains-mono-latin-400-normal.woff2`, `-700-` | JetBrains Mono: code and keys | `@fontsource/jetbrains-mono` |

To update: bump the `@fontsource*` dev dependencies in `web/package.json`, `npm install`, and copy the same files (and `LICENSE`) from `node_modules/<package>/files/`.
