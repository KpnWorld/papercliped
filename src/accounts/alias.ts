import { randomInt } from "node:crypto";
import { createHmac } from "node:crypto";

/**
 * Anonymous display names: a short first name + two digits ("Ann02", "Kai47").
 *
 * They are deliberately SHORTER than the minimum username length (6), so an alias can never be a valid username and the two
 * can't be confused in a log line. Names are 2–3 letters; with ~120 names × 100 numbers there are ~12,000 aliases.
 */
const NAMES = [
  "Abe", "Ace", "Ada", "Al", "Ali", "Amy", "Ann", "Art", "Ava", "Bea", "Ben", "Bo", "Bud", "Cal", "Cat", "Cy", "Dan", "Dee", "Di", "Don",
  "Eda", "Ed", "Eli", "Eva", "Eve", "Fay", "Flo", "Fox", "Gia", "Gil", "Gus", "Hal", "Hui", "Ian", "Ida", "Ira", "Ivy", "Jan", "Jay", "Jo",
  "Joy", "Kai", "Kim", "Kit", "Lea", "Lee", "Leo", "Lin", "Liv", "Lou", "Lu", "Max", "May", "Mei", "Mia", "Moe", "Nat", "Ned", "Nia", "Noa",
  "Oli", "Ola", "Ona", "Ora", "Pam", "Pat", "Pip", "Raj", "Ray", "Rex", "Rio", "Rob", "Roy", "Rue", "Sal", "Sam", "Sia", "Sol", "Sue", "Taj",
  "Tia", "Tim", "Tom", "Tye", "Uma", "Una", "Val", "Van", "Vic", "Vin", "Wes", "Wil", "Xia", "Xan", "Yan", "Yen", "Zac", "Zed", "Zoe", "Zia",
  "Bay", "Cai", "Dev", "Eli", "Gwen".slice(0, 3), "Hoa", "Isa", "Jin", "Kay", "Lex", "Mac", "Nox", "Ozu", "Pru", "Quo", "Rae", "Sky", "Teo", "Uri", "Vee",
];
const POOL = [...new Set(NAMES)];

/** Shape of every alias; usernames (≥6 chars) can never match this. */
export const ALIAS_RE = /^[A-Z][a-z]{1,2}\d{2}$/;

export const generateAlias = (rand: (n: number) => number = (n) => randomInt(n)): string => `${POOL[rand(POOL.length)]}${String(rand(100)).padStart(2, "0")}`;

export const isAlias = (s: string | null | undefined) => !!s && ALIAS_RE.test(s);

/** The name that appears in logs, the operator dashboard and audit rows. */
export const displayName = (a: { username: string; anonymous?: boolean; alias?: string | null }) => (a.anonymous && a.alias ? a.alias : a.username);

/**
 * A stable label standing in for a tenant's Paperclip hostname when its owner is anonymous ("anon-3f9a1c"). It keeps one tenant's
 * activity grouped (so slow-instance debugging still works) without putting the hostname in logs. Keyed so it can't be reversed by guessing hosts.
 */
export const anonInstanceLabel = (key: string, accountId: string) => `anon-${createHmac("sha256", key).update(`instance|${accountId}`).digest("hex").slice(0, 6)}`;
