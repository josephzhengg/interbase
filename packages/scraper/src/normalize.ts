const SEASON_RE = /(summer|fall|winter|spring)\s*(20\d{2})/i;

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-escapes: decode twice, entities-before-tags each round.
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, "&");
  }
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.host = u.host.toLowerCase();
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(new RegExp(SEASON_RE.source, "gi"), " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseSeason(title: string): string | null {
  const m = title.match(SEASON_RE);
  if (!m) return null;
  const term = m[1]!.toLowerCase();
  return `${term[0]!.toUpperCase()}${term.slice(1)} ${m[2]}`;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const PALETTE = ["#4f46e5", "#0d9463", "#b45309", "#be123c", "#0369a1", "#7c3aed", "#0f766e", "#a21caf"];

export function logoColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function snippet(text: string, max = 500): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}
