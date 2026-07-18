import { describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings } from "@interbase/db";
import { setDb } from "@/lib/db";
import { GET } from "./route";

describe("GET /api/listings", () => {
  it("returns listings for ids including inactive, drops junk ids", async () => {
    const db = await createTestDb();
    const [co] = await db.insert(companies).values({
      name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
    }).returning();
    const [row] = await db.insert(listings).values({
      companyId: co!.id, companyName: "Stripe", title: "SWE Intern", titleNorm: "swe intern",
      applyUrl: "https://x.com/1", urlCanon: "https://x.com/1", source: "greenhouse",
      externalId: "1", postedAt: new Date(), isActive: false,
    }).returning();
    setDb(db);
    const res = await GET(new Request(`http://test/api/listings?ids=${row!.id},abc,-5,999999,99999999999`));
    const body = (await res.json()) as { listings: { id: number; isActive: boolean }[] };
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]).toMatchObject({ id: row!.id, isActive: false });
  });

  it("returns empty for no ids", async () => {
    setDb(await createTestDb());
    const res = await GET(new Request("http://test/api/listings"));
    expect(((await res.json()) as { listings: unknown[] }).listings).toEqual([]);
  });
});
