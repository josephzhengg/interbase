import { describe, expect, it } from "vitest";
import { extractTags, isEntryLevel, scoreListing } from "./rules";
import { rawListingSchema, type RawListing } from "./types";

function raw(overrides: Partial<RawListing> = {}): RawListing {
  return rawListingSchema.parse({
    source: "greenhouse", externalId: "1", companyName: "Acme", companySlug: "acme",
    title: "Software Engineering Intern", applyUrl: "https://acme.com/jobs/1",
    ...overrides,
  });
}

describe("isEntryLevel", () => {
  it.each([
    ["Software Engineering Intern, Summer 2027", true],
    ["Software Engineer Co-op", true],
    ["Co-Op Software Developer", true],
    ["New Grad Software Engineer", true],
    ["Entry-Level Data Engineer", true],
    ["Senior Software Engineer", false],
    ["Staff Machine Learning Engineer", false],
    ["Machine Learning Intern (PhD)", false],
    ["Engineering Manager, Internal Tools", false],
    ["Internal Communications Coordinator", false], // "Internal" must NOT match \bintern\b
    ["Software Engineer", false], // no entry-level signal at all
    ["Senior Software Engineering Intern", false],
    ["Staff Intern Program Manager", false],
  ])("%s → %s", (title, expected) => {
    expect(isEntryLevel(title)).toBe(expected);
  });
});

describe("extractTags", () => {
  it("detects paid from description dollars or compensation data", () => {
    expect(extractTags(raw({ descriptionText: "Pay: $45/hour plus housing" }))).toContain("paid");
    expect(extractTags(raw({ hasCompensationData: true }))).toContain("paid");
  });
  it("negative sponsorship wins over the word 'sponsor'", () => {
    const tags = extractTags(raw({ descriptionText: "We are unable to sponsor work visas." }));
    expect(tags).toContain("no-sponsorship");
    expect(tags).not.toContain("sponsors-visa");
  });
  it("positive sponsorship detected from description and structured field", () => {
    expect(extractTags(raw({ descriptionText: "We sponsor visas and support CPT/OPT." }))).toContain("sponsors-visa");
    expect(extractTags(raw({ sponsorship: "yes" }))).toContain("sponsors-visa");
    expect(extractTags(raw({ sponsorship: "no" }))).toContain("no-sponsorship");
  });
  it("catches common negative-sponsorship phrasings", () => {
    for (const d of [
      "We do not sponsor employment visas.",
      "This position does not sponsor visas.",
      "Visa sponsorship is not available for this role.",
      "We do not offer visa sponsorship.",
    ]) {
      const tags = extractTags(raw({ descriptionText: d }));
      expect(tags, d).toContain("no-sponsorship");
      expect(tags, d).not.toContain("sponsors-visa");
    }
    // word boundary: "casino" must not trigger the "no" branch
    expect(extractTags(raw({ descriptionText: "Our casino sponsor is great." }))).toContain("sponsors-visa");
  });
  it("new-grad-ok and freshman-ok", () => {
    expect(extractTags(raw({ title: "New Grad Software Engineer" }))).toContain("new-grad-ok");
    expect(extractTags(raw({ descriptionText: "Open to freshman and sophomore students" }))).toContain("freshman-ok");
  });
  it("empty description yields no tags", () => {
    expect(extractTags(raw())).toEqual([]);
  });
});

describe("scoreListing", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  it("full rubric sums to 100", () => {
    const r = raw({
      descriptionText: "x".repeat(300),
      locations: ["New York, NY"],
      postedAt: new Date("2026-07-14T12:00:00Z"),
    });
    const score = scoreListing({ raw: r, tags: ["paid", "sponsors-visa"], isKnownCompany: true, now });
    expect(score).toBe(100);
  });
  it("bare unknown-company stale listing scores 0", () => {
    const r = raw({ postedAt: new Date("2026-06-01T00:00:00Z") });
    expect(scoreListing({ raw: r, tags: [], isKnownCompany: false, now })).toBe(0);
  });
  it("null postedAt counts as fresh (it will be stamped first_seen now)", () => {
    const r = raw({ postedAt: null });
    expect(scoreListing({ raw: r, tags: [], isKnownCompany: false, now })).toBe(15);
  });
  it("no-sponsorship still earns the clarity points", () => {
    const r = raw({ postedAt: new Date("2026-06-01T00:00:00Z") });
    expect(scoreListing({ raw: r, tags: ["no-sponsorship"], isKnownCompany: false, now })).toBe(15);
  });
});
