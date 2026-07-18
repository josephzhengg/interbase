// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readEntries, toggleEntry } from "./saved";

beforeEach(() => window.localStorage.clear());

describe("saved store", () => {
  it("toggles save on and off", () => {
    toggleEntry("saved", 42);
    expect(readEntries("saved").map((e) => e.listingId)).toEqual([42]);
    toggleEntry("saved", 42);
    expect(readEntries("saved")).toEqual([]);
  });
  it("keeps saved and applied separate", () => {
    toggleEntry("saved", 1);
    toggleEntry("applied", 2);
    expect(readEntries("saved").map((e) => e.listingId)).toEqual([1]);
    expect(readEntries("applied").map((e) => e.listingId)).toEqual([2]);
  });
  it("survives corrupted storage", () => {
    window.localStorage.setItem("interbase.saved", "not json");
    expect(readEntries("saved")).toEqual([]);
  });
});
