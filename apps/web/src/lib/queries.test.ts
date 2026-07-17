import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings, type Db } from "@interbase/db";
import {
  getCompaniesWithCounts, getCompanyBySlug, getFeed, getListingById, getListingsByIds, getSeasons,
} from "./queries";

let db: Db;
let stripeId: number;

async function insertListing(overrides: Partial<typeof listings.$inferInsert> = {}) {
  const [row] = await db.insert(listings).values({
    companyId: stripeId, companyName: "Stripe", title: "Software Engineering Intern",
    titleNorm: "software engineering intern", applyUrl: "https://x.com/1", urlCanon: "https://x.com/1",
    source: "greenhouse", externalId: `e-${Math.random()}`, postedAt: new Date("2026-07-14T00:00:00Z"),
    ...overrides,
  }).returning();
  return row!;
}

beforeEach(async () => {
  db = await createTestDb();
  const [co] = await db.insert(companies).values({
    name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
  }).returning();
  stripeId = co!.id;
});

describe("getFeed", () => {
  it("returns active listings newest-first, quality breaks ties", async () => {
    const same = new Date("2026-07-14T00:00:00Z");
    await insertListing({ title: "B", postedAt: same, qualityScore: 10 });
    await insertListing({ title: "A", postedAt: same, qualityScore: 90 });
    await insertListing({ title: "Old inactive", isActive: false });
    const feed = await getFeed(db);
    expect(feed.map((l) => l.title)).toEqual(["A", "B"]);
  });

  it("full-text search matches title and company", async () => {
    await insertListing({ title: "Machine Learning Intern" });
    await insertListing({ title: "iOS Intern", companyName: "Figma" });
    expect((await getFeed(db, { q: "machine learning" })).map((l) => l.title)).toEqual(["Machine Learning Intern"]);
    expect(await getFeed(db, { q: "figma" })).toHaveLength(1);
  });

  it("filters: remote, season, visa, frosh, location", async () => {
    await insertListing({ title: "R", isRemote: true, season: "Summer 2027", tags: ["sponsors-visa"] });
    await insertListing({ title: "N", locations: ["New York, NY"], tags: ["freshman-ok"] });
    expect((await getFeed(db, { remote: true })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { season: "Summer 2027" })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { visa: true })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { frosh: true })).map((l) => l.title)).toEqual(["N"]);
    expect((await getFeed(db, { location: "new york" })).map((l) => l.title)).toEqual(["N"]);
  });
});

describe("byId / byIds", () => {
  it("include inactive listings (for /saved and permalinks)", async () => {
    const row = await insertListing({ isActive: false });
    expect((await getListingById(db, row.id))?.isActive).toBe(false);
    expect(await getListingsByIds(db, [row.id, 999999])).toHaveLength(1);
    expect(await getListingsByIds(db, [])).toEqual([]);
  });
});

describe("companies + seasons", () => {
  it("counts active listings per company and lists seasons", async () => {
    await insertListing({ season: "Summer 2027" });
    await insertListing({ season: "Fall 2026", isActive: false });
    const cos = await getCompaniesWithCounts(db);
    expect(cos).toHaveLength(1);
    expect(cos[0]).toMatchObject({ slug: "stripe", activeCount: 1 });
    expect(await getSeasons(db)).toEqual(["Summer 2027"]);
    const page = await getCompanyBySlug(db, "stripe");
    expect(page?.listings).toHaveLength(1);
    expect(await getCompanyBySlug(db, "nope")).toBeNull();
  });
});
