import {
  and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, or, sql,
} from "drizzle-orm";
import { companies, listings, type Db } from "@interbase/db";

export const PAGE_SIZE = 50;

export interface FeedFilters {
  q?: string; location?: string; remote?: boolean; season?: string;
  visa?: boolean; frosh?: boolean; page?: number;
}

export interface FeedListing {
  id: number; title: string; companyName: string; companySlug: string; logoColor: string;
  applyUrl: string; descriptionSnippet: string; locations: string[]; isRemote: boolean;
  season: string | null; tags: string[]; postedAt: Date; isActive: boolean;
}

const feedSelection = {
  id: listings.id, title: listings.title, companyName: listings.companyName,
  companySlug: companies.slug, logoColor: companies.logoColor,
  applyUrl: listings.applyUrl, descriptionSnippet: listings.descriptionSnippet,
  locations: listings.locations, isRemote: listings.isRemote, season: listings.season,
  tags: listings.tags, postedAt: listings.postedAt, isActive: listings.isActive,
};

export async function getFeed(db: Db, f: FeedFilters = {}): Promise<FeedListing[]> {
  const conds = [eq(listings.isActive, true)];
  if (f.q) {
    conds.push(or(
      sql`${listings.search} @@ websearch_to_tsquery('english', ${f.q})`,
      ilike(listings.title, `%${f.q}%`),
      ilike(listings.companyName, `%${f.q}%`),
    )!);
  }
  if (f.location) {
    conds.push(sql`exists (select 1 from unnest(${listings.locations}) as loc where loc ilike ${`%${f.location}%`})`);
  }
  if (f.remote) conds.push(eq(listings.isRemote, true));
  if (f.season) conds.push(eq(listings.season, f.season));
  if (f.visa) conds.push(arrayContains(listings.tags, ["sponsors-visa"]));
  if (f.frosh) conds.push(arrayContains(listings.tags, ["freshman-ok"]));
  return db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(and(...conds))
    .orderBy(desc(listings.postedAt), desc(listings.qualityScore))
    .limit(PAGE_SIZE * Math.max(1, f.page ?? 1));
}

export async function getListingById(db: Db, id: number): Promise<FeedListing | null> {
  const rows = await db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(eq(listings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getListingsByIds(db: Db, ids: number[]): Promise<FeedListing[]> {
  if (ids.length === 0) return [];
  return db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(inArray(listings.id, ids));
}

export async function getSeasons(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ season: listings.season }).from(listings)
    .where(and(eq(listings.isActive, true), isNotNull(listings.season)))
    .orderBy(desc(listings.season));
  return rows.map((r) => r.season!);
}

export interface CompanySummary {
  id: number; name: string; slug: string; website: string | null;
  logoColor: string; activeCount: number;
}

export async function getCompaniesWithCounts(db: Db): Promise<CompanySummary[]> {
  const rows = await db.select({
    id: companies.id, name: companies.name, slug: companies.slug,
    website: companies.website, logoColor: companies.logoColor,
    activeCount: count(listings.id),
  }).from(companies)
    .leftJoin(listings, and(eq(listings.companyId, companies.id), eq(listings.isActive, true)))
    .groupBy(companies.id)
    .orderBy(desc(count(listings.id)), companies.name);
  return rows.map((r) => ({ ...r, activeCount: Number(r.activeCount) }));
}

export async function getCompanyBySlug(
  db: Db, slug: string,
): Promise<{ company: typeof companies.$inferSelect; listings: FeedListing[] } | null> {
  const co = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
  if (!co[0]) return null;
  const rows = await db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(and(eq(listings.companyId, co[0].id), eq(listings.isActive, true)))
    .orderBy(desc(listings.postedAt));
  return { company: co[0], listings: rows };
}
