/** Parses CHANGELOG.md ("## vX.Y.Z — title", bullet lists, free paragraphs) into releases for the changelog page and feed. */
export type Kind = "new" | "improved" | "fixed";
export interface Entry {
  kind: Kind;
  text: string; // markdown (inline)
}
export interface Release {
  version: string; // "v2.0.0" or "Unreleased"
  title: string;
  date: string | null; // YYYY-MM-DD, null when not recorded
  anchor: string;
  intro: string[]; // paragraphs (markdown)
  entries: Entry[];
  unreleased: boolean;
}

export function kindOf(text: string): Kind {
  const t = text.replace(/\*\*/g, "").trim().toLowerCase();
  if (/^(fixed|fix)\b|^fixes\b/.test(t)) return "fixed";
  if (/^(new|added|add)\b|^new\b|\bnew (docs|page|site|website|home)\b|^(paperclip plugin|plugin link api|public site|beta connection manager|mcp server|hosted multi-tenant|papercliped accounts|anonymous mode|automated npm publishing|two plugins)\b/.test(t)) return "new";
  return "improved";
}

export function parseChangelog(md: string, dates: Record<string, string> = {}): Release[] {
  const releases: Release[] = [];
  let cur: Release | null = null;
  let bullet: string | null = null;
  const flush = () => {
    if (cur && bullet !== null) cur.entries.push({ kind: kindOf(bullet), text: bullet.trim() });
    bullet = null;
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const h = /^## (v\d[^\s]*|Unreleased)(?:\s+[—-]\s+(.*))?$/.exec(raw);
    if (h) {
      flush();
      const version = h[1];
      cur = { version, title: (h[2] ?? "").trim(), date: dates[version] ?? null, anchor: version.toLowerCase().replace(/[^a-z0-9]+/g, "-"), intro: [], entries: [], unreleased: version === "Unreleased" };
      releases.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^- /.test(raw)) {
      flush();
      bullet = raw.slice(2);
    } else if (/^\s{2,}\S/.test(raw) && bullet !== null) {
      bullet += " " + raw.trim();
    } else if (raw.trim()) {
      flush();
      cur.intro.push(raw.trim());
    } else flush();
  }
  flush();
  // An empty "## Unreleased" (right after a release) isn't shown.
  return releases.filter((r) => !(r.unreleased && !r.entries.length && !r.intro.length));
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (md: string) => md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/** Atom feed of released versions (Unreleased is left out). */
export function atomFeed(releases: Release[], site: string): string {
  const rel = releases.filter((r) => !r.unreleased);
  const updated = rel.find((r) => r.date)?.date ?? "2026-10-06";
  const items = rel.map((r) => {
    const body = [...r.intro.map(plain), ...r.entries.map((e) => `• ${plain(e.text)}`)].join("\n");
    return `  <entry>\n    <title>${xml(`${r.version}${r.title ? ` — ${r.title}` : ""}`)}</title>\n    <id>${site}/changelog#${r.anchor}</id>\n    <link href="${site}/changelog#${r.anchor}"/>\n    <updated>${r.date ?? updated}T00:00:00Z</updated>\n    <content type="text">${xml(body)}</content>\n  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>Papercliped changelog</title>\n  <id>${site}/changelog</id>\n  <link href="${site}/changelog"/>\n  <link rel="self" href="${site}/changelog.xml"/>\n  <updated>${updated}T00:00:00Z</updated>\n${items.join("\n")}\n</feed>\n`;
}
