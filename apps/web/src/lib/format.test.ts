import { describe, expect, it } from "vitest";
import { groupListings, relativeTime } from "./format";

const now = new Date("2026-07-15T12:00:00");

describe("relativeTime", () => {
  it.each([
    ["2026-07-15T11:59:40", "just now"],
    ["2026-07-15T11:30:00", "30m ago"],
    ["2026-07-15T07:00:00", "5h ago"],
    ["2026-07-13T12:00:00", "2d ago"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
  it("falls back to a short date after 7 days", () => {
    expect(relativeTime("2026-06-20T12:00:00", now)).toBe("Jun 20");
  });
});

describe("groupListings", () => {
  it("buckets by calendar day and keeps order New today → Yesterday → Earlier", () => {
    const items = [
      { id: 1, postedAt: "2026-07-15T08:00:00" },
      { id: 2, postedAt: "2026-07-14T20:00:00" },
      { id: 3, postedAt: "2026-07-10T09:00:00" },
    ];
    const groups = groupListings(items, now);
    expect(groups.map((g) => g.label)).toEqual(["New today", "Yesterday", "Earlier"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([1]);
  });
  it("omits empty groups", () => {
    const groups = groupListings([{ postedAt: "2026-07-15T09:00:00" }], now);
    expect(groups.map((g) => g.label)).toEqual(["New today"]);
  });
});
