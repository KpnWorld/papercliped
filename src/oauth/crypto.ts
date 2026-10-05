import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const b64url = (buf: Buffer) => buf.toString("base64url");
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y); // hash first so length differences don't leak
}

/** Derive a 256-bit key for sealing stored Paperclip credentials from BRIDGE_SECRET. */
export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "paperclip-bridge", "credential-seal-v1", 32));
}

/** AES-256-GCM. Output: base64url(iv[12] | tag[16] | ciphertext). */
export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return b64url(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

export function unseal(key: Buffer, sealed: string): string {
  const raw = Buffer.from(sealed, "base64url");
  if (raw.length < 29) throw new Error("sealed value too short");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/; // base64url(sha256) = 43 chars

export const isValidCodeChallenge = (c: string) => CHALLENGE_RE.test(c);

/** RFC 7636 S256 verification. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier)) return false;
  return safeEqual(b64url(createHash("sha256").update(verifier).digest()), challenge);
}
