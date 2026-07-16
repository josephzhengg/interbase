import { describe, expect, it } from "vitest";
import { fetchSimplify } from "./simplify";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/simplify.json";

describe("fetchSimplify", () => {
  it("maps active+visible entries, structured sponsorship, season from terms", async () => {
    const raws = await fetchSimplify("SimplifyJobs/Summer2027-Internships", stubFetch(fixture));
    expect(raws).toHaveLength(2); // inactive entry skipped
    expect(raws[0]).toMatchObject({
      source: "github_list",
      externalId: "sim-0001",
      companyName: "Chime",
      companySlug: "chime",
      sponsorship: "yes",
      season: "Summer 2027",
      locations: ["San Francisco, CA"],
      isRemote: false,
    });
    expect(raws[0]!.postedAt).toEqual(new Date(1784100000 * 1000));
    expect(raws[1]).toMatchObject({ sponsorship: "no", isRemote: true });
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchSimplify("SimplifyJobs/Nope", stubFetch([], 404))).rejects.toThrow(/404/);
  });
});
