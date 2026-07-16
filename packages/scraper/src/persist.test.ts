import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings } from "@interbase/db";
import { crossSourceDedupe, expireListings, upsertCompanies, upsertListings } from "./persist";
import { rawListingSchema, type RawListing } from "./types";

const SEED = [{ name: "Stripe", slug: "stripe", atsType: "greenhouse" as const, atsToken: "stripe" }];

function raw(overrides: Partial<RawListing> = {}): RawListing {
  return rawListingSchema.parse({
    source: "greenhouse", externalId: "gh-1", companyName: "Stripe", companySlug: "stripe",
    title: "Software Engineering Intern, Summer 2027",
    applyUrl: "https://boards.greenhouse.io/stripe/jobs/1?gh_src=x",
    descriptionText: "Pay: $50/hour. We sponsor visas.",
    postedAt: new Date("2026-07-14T00:00:00Z"),
    ...overrides,
  });
}

describe("upsertListings", () => {
  it("inserts entry-level listings with computed fields, skips senior roles", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const now = new Date("2026-07-15T00:00:00Z");
    const result = await upsertListings(
      db,
      [raw(), raw({ externalId: "gh-2", title: "Senior Software Engineer" })],
      { knownSlugs: new Set(["stripe"]), now },
    );
    expect(result).toEqual({ kept: 1, skipped: 1 });
    const [row] = await db.select().from(listings);
    expect(row).toMatchObject({
      season: "Summer 2027",
      urlCanon: "https://boards.greenhouse.io/stripe/jobs/1",
      titleNorm: "software engineering intern",
      isActive: true,
    });
    expect(row!.tags).toEqual(expect.arrayContaining(["paid", "sponsors-visa"]));
    // rubric for this fixture: known 30 + paid 20 + sponsorship clarity 15 + no location 0 + short desc 0 + fresh 15
    expect(row!.qualityScore).toBe(80);
  });

  it("re-upsert updates lastSeenAt without duplicating, preserves postedAt", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const t1 = new Date("2026-07-14T00:00:00Z");
    const t2 = new Date("2026-07-15T00:00:00Z");
    await upsertListings(db, [raw()], { knownSlugs: new Set(["stripe"]), now: t1 });
    await upsertListings(db, [raw()], { knownSlugs: new Set(["stripe"]), now: t2 });
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeenAt).toEqual(t2);
    expect(rows[0]!.firstSeenAt).toEqual(t1);
  });

  it("auto-creates companies for unknown github_list slugs", async () => {
    const db = await createTestDb();
    await upsertListings(
      db,
      [raw({ source: "github_list", externalId: "sim-9", companyName: "Vanta", companySlug: "vanta" })],
      { knownSlugs: new Set() },
    );
    const co = await db.select().from(companies).where(eq(companies.slug, "vanta"));
    expect(co).toHaveLength(1);
    expect(co[0]!.atsType).toBe("github_list");
  });

  it("skips ATS-sourced listings for unknown companies instead of mislabeling them", async () => {
    const db = await createTestDb();
    const result = await upsertListings(
      db,
      [raw({ source: "greenhouse", externalId: "gh-x", companyName: "Ghost Co", companySlug: "ghost-co" })],
      { knownSlugs: new Set() },
    );
    expect(result).toEqual({ kept: 0, skipped: 1 });
    const co = await db.select().from(companies).where(eq(companies.slug, "ghost-co"));
    expect(co).toHaveLength(0);
  });
});

describe("crossSourceDedupe", () => {
  it("deactivates github_list duplicates of ATS rows (same company + titleNorm)", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    await upsertListings(
      db,
      [
        raw(), // greenhouse
        raw({ source: "github_list", externalId: "sim-1", applyUrl: "https://simplify.jobs/x", title: "Software Engineering Intern (Summer 2027)" }),
      ],
      { knownSlugs: new Set(["stripe"]) },
    );
    const n = await crossSourceDedupe(db);
    expect(n).toBe(1);
    const rows = await db.select().from(listings).where(eq(listings.isActive, true));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("greenhouse");
  });
});

describe("expireListings", () => {
  it("deactivates stale-seen and old-posted listings", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const now = new Date("2026-07-15T00:00:00Z");
    await upsertListings(
      db,
      [
        raw({ externalId: "fresh" }),
        raw({ externalId: "old-posted", postedAt: new Date("2026-05-01T00:00:00Z") }),
      ],
      { knownSlugs: new Set(["stripe"]), now },
    );
    // simulate a listing not seen for 6 days
    await db.update(listings).set({ lastSeenAt: new Date("2026-07-09T00:00:00Z") })
      .where(eq(listings.externalId, "fresh"));
    const n = await expireListings(db, now);
    expect(n).toBe(2);
  });
});
