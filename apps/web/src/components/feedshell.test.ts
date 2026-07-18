import { describe, expect, it } from "vitest";
import { nextId } from "./FeedShell";

describe("nextId", () => {
  it("moves down and up, clamping at the ends", () => {
    expect(nextId([1, 2, 3], 1, 1)).toBe(2);
    expect(nextId([1, 2, 3], 3, 1)).toBe(3);
    expect(nextId([1, 2, 3], 2, -1)).toBe(1);
    expect(nextId([1, 2, 3], 1, -1)).toBe(1);
  });
  it("handles empty and unknown selections", () => {
    expect(nextId([], null, 1)).toBeNull();
    expect(nextId([5, 6], null, 1)).toBe(5);
    expect(nextId([5, 6], 99, 1)).toBe(5);
  });
});
