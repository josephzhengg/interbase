import { describe, expect, it } from "vitest";
import { fetchGreenhouse } from "./greenhouse";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/greenhouse.json";

const company = { name: "Stripe", slug: "stripe", atsType: "greenhouse" as const, atsToken: "stripe" };

describe("fetchGreenhouse", () => {
  it("maps jobs to RawListing (no entry-level filtering here)", async () => {
    const raws = await fetchGreenhouse(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    const first = raws[0]!;
    expect(first).toMatchObject({
      source: "greenhouse",
      externalId: "4011001",
      companyName: "Stripe",
      companySlug: "stripe",
      title: "Software Engineering Intern, Summer 2027",
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/4011001?gh_src=feed",
      locations: ["San Francisco, CA"],
      isRemote: false,
    });
    expect(first.descriptionText).toBe("Join us! Pay: $50/hour. We sponsor visas.");
    expect(first.postedAt).toEqual(new Date("2026-07-14T09:00:00-04:00"));
    expect(raws[1]!.isRemote).toBe(true);
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchGreenhouse(company, stubFetch({}, 404))).rejects.toThrow(/404/);
  });

  it("drops jobs with non-http apply urls instead of failing the source", async () => {
    const body = {
      jobs: [
        { id: 1, title: "SWE Intern", absolute_url: "javascript:alert(1)", location: { name: "NYC" }, content: "" },
        { id: 2, title: "Data Intern", absolute_url: "https://boards.greenhouse.io/x/jobs/2", location: { name: "NYC" }, content: "" },
      ],
    };
    const raws = await fetchGreenhouse(company, stubFetch(body));
    expect(raws.map((r) => r.externalId)).toEqual(["2"]);
  });
});
