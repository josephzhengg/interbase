import { and, eq, lt, or, sql } from "drizzle-orm";
import { companies, listings, type Db } from "@interbase/db";
import { canonicalUrl, logoColor, normalizeTitle, parseSeason, snippet } from "./normalize";
import { extractTags, isEntryLevel, scoreListing } from "./rules";
import { rawListingSchema, type RawListing, type SeedCompany } from "./types";

export async function upsertCompanies(db: Db, seed: SeedCompany[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const c of seed) {
    const [row] = await db
      .insert(companies)
      .values({
        name: c.name, slug: c.slug, website: c.website,
        atsType: c.atsType, atsToken: c.atsToken, logoColor: logoColor(c.name),
      })
      .onConflictDoUpdate({
        target: companies.slug,
        set: { name: c.name, atsType: c.atsType, atsToken: c.atsToken },
      })
      .returning({ id: companies.id });
    map.set(c.slug, row!.id);
  }
  return map;
}

async function ensureCompany(db: Db, raw: RawListing): Promise<number> {
  const existing = await db.select({ id: companies.id }).from(companies)
    .where(eq(companies.slug, raw.companySlug));
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(companies)
    .values({
      name: raw.companyName, slug: raw.companySlug,
      atsType: "github_list", logoColor: logoColor(raw.companyName),
    })
    .onConflictDoNothing({ target: companies.slug })
    .returning({ id: companies.id });
  if (inserted[0]) return inserted[0].id;
  const again = await db.select({ id: companies.id }).from(companies)
    .where(eq(companies.slug, raw.companySlug));
  return again[0]!.id;
}

export async function upsertListings(
  db: Db,
  raws: RawListing[],
  opts: { knownSlugs: Set<string>; now?: Date },
): Promise<{ kept: number; skipped: number }> {
  const now = opts.now ?? new Date();
  let kept = 0;
  let skipped = 0;
  const companyIds = new Map<string, number>();
  for (const candidate of raws) {
    const parsed = rawListingSchema.safeParse(candidate);
    if (!parsed.success || !isEntryLevel(parsed.data.title)) {
      skipped++;
      continue;
    }
    const raw = parsed.data;
    let companyId = companyIds.get(raw.companySlug);
    if (companyId == null) {
      const existing = await db.select({ id: companies.id }).from(companies)
        .where(eq(companies.slug, raw.companySlug));
      if (existing[0]) {
        companyId = existing[0].id;
      } else if (raw.source === "github_list") {
        companyId = await ensureCompany(db, raw);
      } else {
        skipped++;
        continue;
      }
      companyIds.set(raw.companySlug, companyId);
    }
    const tags = extractTags(raw);
    const content = {
      companyName: raw.companyName,
      title: raw.title,
      titleNorm: normalizeTitle(raw.title),
      applyUrl: raw.applyUrl,
      urlCanon: canonicalUrl(raw.applyUrl),
      descriptionSnippet: snippet(raw.descriptionText),
      locations: raw.locations,
      isRemote: raw.isRemote,
      season: raw.season ?? parseSeason(raw.title),
      tags,
      qualityScore: scoreListing({ raw, tags, isKnownCompany: opts.knownSlugs.has(raw.companySlug), now }),
    };
    await db.insert(listings)
      .values({
        ...content, companyId, source: raw.source, externalId: raw.externalId,
        postedAt: raw.postedAt ?? now, firstSeenAt: now, lastSeenAt: now, isActive: true,
      })
      .onConflictDoUpdate({
        target: [listings.source, listings.externalId],
        set: { ...content, lastSeenAt: now, isActive: true },
      });
    kept++;
  }
  return { kept, skipped };
}

export async function crossSourceDedupe(db: Db): Promise<number> {
  const res = (await db.execute(sql`
    update listings g
    set is_active = false
    from listings a
    where g.source = 'github_list'
      and a.source <> 'github_list'
      and g.company_id = a.company_id
      and g.is_active and a.is_active
      and (g.title_norm = a.title_norm or g.url_canon = a.url_canon)
    returning g.id
  `)) as unknown as { rows: unknown[] };
  return res.rows.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function expireListings(db: Db, now = new Date()): Promise<number> {
  const staleSeen = new Date(now.getTime() - 5 * DAY_MS);
  const stalePosted = new Date(now.getTime() - 60 * DAY_MS);
  const rows = await db.update(listings)
    .set({ isActive: false })
    .where(and(
      eq(listings.isActive, true),
      or(lt(listings.lastSeenAt, staleSeen), lt(listings.postedAt, stalePosted)),
    ))
    .returning({ id: listings.id });
  return rows.length;
}
