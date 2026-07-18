import { describe, expect, it } from "vitest";
import { applyFilter, withPage } from "./urlstate";

describe("applyFilter", () => {
  it("sets and removes keys", () => {
    expect(applyFilter("", "remote", "1")).toBe("?remote=1");
    expect(applyFilter("remote=1", "remote", null)).toBe("");
  });
  it("resets page and sel on any filter change", () => {
    expect(applyFilter("q=swe&page=3&sel=12", "remote", "1")).toBe("?q=swe&remote=1");
  });
  it("empty string value clears the key", () => {
    expect(applyFilter("q=swe", "q", "")).toBe("");
  });
});

describe("withPage", () => {
  it("sets page and preserves filters", () => {
    expect(withPage("q=swe", 2)).toBe("?q=swe&page=2");
  });
});
