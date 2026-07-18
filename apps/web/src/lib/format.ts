export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GROUPS = ["New today", "Yesterday", "Earlier"] as const;

function dayGroup(iso: string, now: Date): (typeof GROUPS)[number] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const then = new Date(iso);
  if (then >= startOfToday) return "New today";
  if (then >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export function groupListings<T extends { postedAt: string }>(
  items: T[], now = new Date(),
): { label: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const label = dayGroup(item.postedAt, now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return GROUPS.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}
