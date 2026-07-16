import { describe, expect, it } from "vitest";
import { fetchLever } from "./lever";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/lever.json";

const company = { name: "Plaid", slug: "plaid", atsType: "lever" as const, atsToken: "plaid" };

describe("fetchLever", () => {
  it("maps postings to RawListing", async () => {
    const raws = await fetchLever(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    expect(raws[0]).toMatchObject({
      source: "lever",
      externalId: "a1b2c3",
      companySlug: "plaid",
      title: "Backend Engineering Intern (Summer 2027)",
      applyUrl: "https://jobs.lever.co/plaid/a1b2c3?lever-source=feed",
      locations: ["New York, NY"],
      isRemote: false,
      hasCompensationData: true,
      descriptionText: "Work on our data pipelines. Hourly stipend provided.",
    });
    expect(raws[0]!.postedAt).toEqual(new Date(1784100000000));
    expect(raws[1]).toMatchObject({ isRemote: true, hasCompensationData: false });
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchLever(company, stubFetch([], 500))).rejects.toThrow(/500/);
  });
});
