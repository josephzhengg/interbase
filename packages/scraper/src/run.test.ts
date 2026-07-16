import { describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { listings } from "@interbase/db";
import { runScrape } from "./run";

const seed = [
  { name: "GoodCo", slug: "goodco", atsType: "greenhouse" as const, atsToken: "goodco" },
  { name: "BadCo", slug: "badco", atsType: "greenhouse" as const, atsToken: "badco" },
];

const ghBody = {
  jobs: [{
    id: 1, title: "Software Engineering Intern", absolute_url: "https://boards.greenhouse.io/goodco/jobs/1",
    updated_at: "2026-07-14T00:00:00Z", location: { name: "NYC" }, content: "great team",
  }],
};

const fetchFn = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("goodco")) return new Response(JSON.stringify(ghBody), { status: 200 });
  if (url.includes("badco")) return new Response("{}", { status: 500 });
  return new Response("[]", { status: 200 }); // simplify list
}) as unknown as typeof fetch;

describe("runScrape", () => {
  it("isolates per-source failures and publishes what succeeded", async () => {
    const db = await createTestDb();
    const summary = await runScrape(db, { seed, fetchFn, simplifyRepo: "x/y" });
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatch(/badco/);
    expect(summary.kept).toBe(1);
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
  });
});
