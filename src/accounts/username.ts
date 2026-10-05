/**
 * Papercliped usernames.
 *
 * Rules (from the product spec):
 *  - unique, compared case-insensitively ("OG.kpnwrld" and "og.kpnwrld" are the same name)
 *  - at least 6 characters (assumption: the spec says "up to 6" but its own example `og.kpnwrld` is 10 — see USERNAME_MIN)
 *  - must contain at least one number or symbol
 *  - the only allowed symbols are  .  #  _   (letters and digits otherwise; ASCII only, so no look-alike characters)
 * Extra, to keep names usable in logs: at most 32 characters, must start with a letter or digit, and a few
 * impersonation-prone names are reserved.
 */
export const USERNAME_MIN = 6;
export const USERNAME_MAX = 32;
export const USERNAME_SYMBOLS = [".", "#", "_"] as const;

const ALLOWED = /^[A-Za-z0-9._#]+$/;
const STARTS_OK = /^[A-Za-z0-9]/;
const HAS_NUMBER_OR_SYMBOL = /[0-9._#]/;

/** Compared against the letters-only form of a name, so "admin.1" and "root_9" are caught too. */
const RESERVED = new Set(["admin", "administrator", "root", "system", "support", "staff", "official", "moderator", "papercliped", "paperclip", "cliped", "kpnworld", "kpnsolute", "anthropic", "claude", "openai", "chatgpt"]);

export type UsernameCheck = { ok: true; username: string; key: string } | { ok: false; reason: string };

export const usernameKey = (username: string) => username.toLowerCase();

export function validateUsername(raw: unknown): UsernameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "Choose a username." };
  const u = raw.trim();
  if (u.length < USERNAME_MIN) return { ok: false, reason: `Usernames need at least ${USERNAME_MIN} characters.` };
  if (u.length > USERNAME_MAX) return { ok: false, reason: `Usernames can be at most ${USERNAME_MAX} characters.` };
  if (!ALLOWED.test(u)) return { ok: false, reason: "Use only letters, numbers and these symbols: . # _" };
  if (!STARTS_OK.test(u)) return { ok: false, reason: "Start your username with a letter or number." };
  if (!HAS_NUMBER_OR_SYMBOL.test(u)) return { ok: false, reason: "Include at least one number or one of these symbols: . # _" };
  if (RESERVED.has(u.toLowerCase().replace(/[^a-z]/g, ""))) return { ok: false, reason: "That name is reserved. Please pick another." };
  return { ok: true, username: u, key: usernameKey(u) };
}
