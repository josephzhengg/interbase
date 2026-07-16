import { describe, expect, it } from "vitest";
import {
  canonicalUrl, htmlToText, logoColor, normalizeTitle, parseSeason, slugify, snippet,
} from "./normalize";

describe("htmlToText", () => {
  it("decodes escaped HTML (Greenhouse-style) and strips tags", () => {
    expect(htmlToText("&lt;p&gt;We pay &amp;#36;45&amp;#47;hr&lt;/p&gt;")).toBe("We pay $45/hr");
  });
  it("strips plain tags and collapses whitespace", () => {
    expect(htmlToText("<div>Hello   <b>world</b>\n</div>")).toBe("Hello world");
  });
});

describe("canonicalUrl", () => {
  it("drops query, fragment, trailing slash; lowercases host", () => {
    expect(canonicalUrl("https://Boards.Greenhouse.io/stripe/jobs/123/?gh_src=abc#top"))
      .toBe("https://boards.greenhouse.io/stripe/jobs/123");
  });
  it("returns garbage input unchanged", () => {
    expect(canonicalUrl("not a url")).toBe("not a url");
  });
});

describe("normalizeTitle", () => {
  it("lowercases, removes season, collapses punctuation", () => {
    expect(normalizeTitle("Software Engineering Intern, Summer 2027 (Remote)"))
      .toBe("software engineering intern remote");
  });
});

describe("parseSeason", () => {
  it("extracts season with capitalization", () => {
    expect(parseSeason("SWE Intern - summer 2027")).toBe("Summer 2027");
    expect(parseSeason("Fall2026 Data Intern")).toBe("Fall 2026");
    expect(parseSeason("Backend Intern")).toBeNull();
  });
});

describe("slugify", () => {
  it("kebab-cases company names", () => {
    expect(slugify("Jane Street Capital")).toBe("jane-street-capital");
    expect(slugify("J.P. Morgan & Co.")).toBe("j-p-morgan-co");
  });
});

describe("logoColor", () => {
  it("is deterministic and returns a palette hex", () => {
    expect(logoColor("Stripe")).toBe(logoColor("Stripe"));
    expect(logoColor("Stripe")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("snippet", () => {
  it("returns short text unchanged", () => {
    expect(snippet("hello world")).toBe("hello world");
  });
  it("truncates at a word boundary with ellipsis", () => {
    const long = "word ".repeat(200).trim();
    const s = snippet(long, 50);
    expect(s.length).toBeLessThanOrEqual(51);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("wor…");
  });
});
