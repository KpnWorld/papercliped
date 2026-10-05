import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const b64url = (buf: Buffer) => buf.toString("base64url");
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y); // hash first so length differences don't leak
}

const deriveKey = (secret: string): Buffer => Buffer.from(hkdfSync("sha256", secret, "paperclip-bridge", "credential-seal-v1", 32));

/**
 * Seals stored Paperclip credentials with AES-256-GCM. Output: `<kid>.<base64url(iv[12] | tag[16] | ciphertext)>`.
 * The first secret seals; any listed secret can open, so BRIDGE_SECRET can be rotated without logging everyone out
 * (put the old value in BRIDGE_SECRET_PREVIOUS, then run `rotate-keys`).
 */
export class Keyring {
  private keys = new Map<string, Buffer>();
  readonly currentKid: string;

  constructor(secrets: string[]) {
    if (!secrets.length) throw new Error("Keyring needs at least one secret");
    for (const s of secrets) this.keys.set(kidOf(s), deriveKey(s));
    this.currentKid = kidOf(secrets[0]);
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.currentKid)!, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${this.currentKid}.${b64url(Buffer.concat([iv, cipher.getAuthTag(), ct]))}`;
  }

  unseal(sealed: string): string {
    const dot = sealed.indexOf(".");
    const key = dot > 0 ? this.keys.get(sealed.slice(0, dot)) : undefined;
    if (!key) throw new Error("Stored credential was sealed with a key this bridge no longer has");
    const raw = Buffer.from(sealed.slice(dot + 1), "base64url");
    if (raw.length < 29) throw new Error("sealed value too short");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }

  needsRotation(sealed: string): boolean {
    return !sealed.startsWith(`${this.currentKid}.`);
  }
}

const kidOf = (secret: string) => sha256Hex(`kid:${secret}`).slice(0, 8);

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/; // base64url(sha256) = 43 chars

export const isValidCodeChallenge = (c: string) => CHALLENGE_RE.test(c);

/** RFC 7636 S256 verification. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier)) return false;
  return safeEqual(b64url(createHash("sha256").update(verifier).digest()), challenge);
}
