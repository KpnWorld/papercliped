/**
 * Every community and social link lives here. Defaults are EMPTY on purpose: we don't own a Discord server or social
 * accounts yet, and a link is only rendered once its URL is set (otherwise the UI shows "coming soon").
 * Override at build time with environment variables, e.g. VITE_DISCORD_URL=https://discord.gg/… npm run build.
 */
const env = import.meta.env;
const url = (v: unknown) => (typeof v === "string" && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : "");

export const REPO_URL = "https://github.com/OpenSourcx/papercliped";

export const community = {
  github: REPO_URL,
  discussions: url(env.VITE_DISCUSSIONS_URL),
  issues: `${REPO_URL}/issues`,
  newIssue: `${REPO_URL}/issues/new/choose`,
  discord: url(env.VITE_DISCORD_URL),
  x: url(env.VITE_X_URL),
  forum: url(env.VITE_FORUM_URL),
  email: "support@papercliped.co",
} as const;

export type SocialKey = "github" | "discussions" | "discord" | "x" | "forum";
export const SOCIALS: { key: SocialKey; label: string }[] = [
  { key: "github", label: "GitHub" },
  { key: "discussions", label: "GitHub Discussions" },
  { key: "discord", label: "Discord" },
  { key: "x", label: "X" },
  { key: "forum", label: "Forum" },
];

/** Only the links that are actually set. */
export function liveSocials(c: Record<string, string> = community) {
  return SOCIALS.filter((s) => !!c[s.key]).map((s) => ({ ...s, href: c[s.key] }));
}
