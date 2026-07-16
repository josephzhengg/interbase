import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./testing";
import { companies, listings } from "./schema";

describe("schema", () => {
  it("round-trips a company and listing, and full-text search matches", async () => {
    const db = await createTestDb();
    const [co] = await db
      .insert(companies)
      .values({ name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff" })
      .returning();
    await db.insert(listings).values({
      companyId: co!.id,
      companyName: "Stripe",
      title: "Software Engineering Intern, Summer 2027",
      titleNorm: "software engineering intern",
      applyUrl: "https://stripe.com/jobs/1",
      urlCanon: "https://stripe.com/jobs/1",
      source: "greenhouse",
      externalId: "1",
      postedAt: new Date(),
    });
    const hits = await db
      .select({ id: listings.id })
      .from(listings)
      .where(sql`${listings.search} @@ websearch_to_tsquery('english', 'engineering stripe')`);
    expect(hits).toHaveLength(1);
  });

  it("rejects duplicate (source, externalId)", async () => {
    const db = await createTestDb();
    const [co] = await db
      .insert(companies)
      .values({ name: "Ramp", slug: "ramp", atsType: "ashby", atsToken: "ramp", logoColor: "#0b1f3a" })
      .returning();
    const row = {
      companyId: co!.id, companyName: "Ramp", title: "Backend Intern", titleNorm: "backend intern",
      applyUrl: "https://ramp.com/jobs/2", urlCanon: "https://ramp.com/jobs/2",
      source: "ashby" as const, externalId: "2", postedAt: new Date(),
    };
    await db.insert(listings).values(row);
    await expect(db.insert(listings).values(row)).rejects.toThrow();
  });
});
