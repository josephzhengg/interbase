import { describe, expect, it } from "vitest";
import { fetchAshby } from "./ashby";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/ashby.json";

const company = { name: "Ramp", slug: "ramp", atsType: "ashby" as const, atsToken: "ramp" };

describe("fetchAshby", () => {
  it("maps jobs to RawListing with merged locations", async () => {
    const raws = await fetchAshby(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    expect(raws[0]).toMatchObject({
      source: "ashby",
      externalId: "9f1c2e34-0000-4000-8000-000000000001",
      title: "Software Engineer Intern (Summer 2027)",
      applyUrl: "https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000001/application",
      locations: ["New York", "San Francisco"],
      isRemote: false,
      hasCompensationData: true,
    });
    expect(raws[0]!.descriptionText).toBe("Build internal tools. Open to freshman and sophomore students.");
    expect(raws[1]).toMatchObject({ isRemote: true, hasCompensationData: false });
    // falls back to jobUrl when applyUrl missing
    expect(raws[1]!.applyUrl).toBe("https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000002");
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchAshby(company, stubFetch({}, 403))).rejects.toThrow(/403/);
  });
});
