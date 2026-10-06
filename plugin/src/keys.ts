import { createHash } from "node:crypto";

/** Where one Paperclip user's bridge token lives in plugin state. Keyed by the host-verified user id, never by anything the UI sends. */
export function linkScope(userId: string) {
  return { scopeKind: "instance" as const, namespace: "papercliped-links", stateKey: `user-${createHash("sha256").update(userId).digest("hex").slice(0, 40)}` };
}

export interface StoredLink {
  token: string;
  linkedAt: number;
}

export function isStoredLink(v: unknown): v is StoredLink {
  return !!v && typeof v === "object" && typeof (v as StoredLink).token === "string" && (v as StoredLink).token.startsWith("pcb_pl_");
}
