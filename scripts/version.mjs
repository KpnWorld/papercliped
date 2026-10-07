#!/usr/bin/env node
// Bumps the version everywhere it lives (Major.Minor.Patch), turns "## Unreleased" in the changelog into the new version's
// section, and records the date. Driven by .release.json so other repos can reuse it unchanged.
//
//   node scripts/version.mjs patch "Fix the docs search"     # 2.1.0 → 2.1.1
//   node scripts/version.mjs minor "Paperclip plugin tabs"   # 2.1.1 → 2.2.0
//   node scripts/version.mjs major "Two access levels"       # 2.2.0 → 3.0.0
//   node scripts/version.mjs current                         # prints 2.1.0
//   node scripts/version.mjs check                           # every file agrees and the changelog has the section
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cfg = JSON.parse(readFileSync(join(root, ".release.json"), "utf8"));
const read = (p) => readFileSync(join(root, p), "utf8");
const write = (p, s) => writeFileSync(join(root, p), s);
const die = (m) => {
  console.error(`version: ${m}`);
  process.exit(1);
};
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function versionOf(f) {
  if (f.kind === "json") return JSON.parse(read(f.path)).version;
  const m = new RegExp(f.pattern).exec(read(f.path));
  if (!m) die(`${f.path}: pattern ${f.pattern} not found`);
  return m[1];
}
function setVersion(f, v) {
  if (f.kind === "json") {
    const j = JSON.parse(read(f.path));
    j.version = v;
    write(f.path, JSON.stringify(j, null, 2) + "\n");
  } else {
    write(f.path, read(f.path).replace(new RegExp(f.pattern), (all, old) => all.replace(old, v)));
  }
}
function setLock(p, v) {
  if (!existsSync(join(root, p))) return;
  const j = JSON.parse(read(p));
  j.version = v;
  if (j.packages?.[""]) j.packages[""].version = v;
  write(p, JSON.stringify(j, null, 2) + "\n");
}

const current = versionOf(cfg.versionFiles[0]);
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "current") {
  console.log(current);
  process.exit(0);
}
if (cmd === "check") {
  const bad = cfg.versionFiles.filter((f) => versionOf(f) !== current).map((f) => `${f.path} has ${versionOf(f)}`);
  if (bad.length) die(`versions disagree with ${current}: ${bad.join(", ")}`);
  if (cfg.changelog && !new RegExp(`^## v${current.replace(/\./g, "\\.")}\\b`, "m").test(read(cfg.changelog))) die(`${cfg.changelog} has no "## v${current}" section`);
  console.log(`version ${current}: every file agrees`);
  process.exit(0);
}
if (!["major", "minor", "patch"].includes(cmd)) die('usage: version.mjs <major|minor|patch> "<release title>" | current | check');

const m = SEMVER.exec(current);
if (!m) die(`current version ${current} is not Major.Minor.Patch`);
let [maj, min, pat] = m.slice(1).map(Number);
if (cmd === "major") [maj, min, pat] = [maj + 1, 0, 0];
else if (cmd === "minor") [min, pat] = [min + 1, 0];
else pat += 1;
const next = `${maj}.${min}.${pat}`;
const title = rest.join(" ").trim();
if (!title) die("give the release a short title, e.g. node scripts/version.mjs patch \"Fix the docs search\"");

// Changelog: the entries under "## Unreleased" become this version's section. A release with no entries is refused.
if (cfg.changelog) {
  const cl = read(cfg.changelog);
  const at = cl.search(/^## Unreleased\s*$/m);
  if (at < 0) die(`${cfg.changelog} has no "## Unreleased" section: add what changed there first`);
  const after = cl.slice(at).replace(/^## Unreleased\s*\n/, "");
  const end = after.search(/^## /m);
  const body = (end < 0 ? after : after.slice(0, end)).trim();
  if (!body) die(`"## Unreleased" in ${cfg.changelog} is empty: add what changed first`);
  write(cfg.changelog, cl.slice(0, at) + `## Unreleased\n\n## v${next} — ${title}\n\n${body}\n\n` + (end < 0 ? "" : after.slice(end)));
}
for (const f of cfg.versionFiles) setVersion(f, next);
for (const p of cfg.lockFiles ?? []) setLock(p, next);
if (cfg.datesFile && existsSync(join(root, cfg.datesFile))) {
  const d = JSON.parse(read(cfg.datesFile));
  d[`v${next}`] = new Date().toISOString().slice(0, 10);
  write(cfg.datesFile, JSON.stringify(d, null, 2) + "\n");
}
console.log(`${current} → ${next}`);
