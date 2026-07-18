import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { listings, subscribers, type Db } from "@interbase/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DigestItem {
  title: string; companyName: string; locations: string[]; isRemote: boolean; applyUrl: string;
}

export function buildDigestHtml(
  items: DigestItem[],
  opts: { baseUrl: string; unsubscribeToken: string; label: string },
): string {
  const rows = items.map((l) =>
    `<li style="margin-bottom:8px"><a href="${l.applyUrl}" style="font-weight:600;color:#4f46e5">${l.title}</a><br/><span style="color:#8b8f96;font-size:13px">${l.companyName} · ${l.isRemote ? "Remote" : l.locations[0] ?? "Location TBA"}</span></li>`,
  ).join("");
  return `<div style="font-family:-apple-system,'Segoe UI',sans-serif;color:#17181a">
<h2 style="font-size:16px">New entry-level internships ${opts.label}</h2>
<ul style="list-style:none;padding:0">${rows}</ul>
<p style="font-size:12px;color:#8b8f96"><a href="${opts.baseUrl}" style="color:#8b8f96">interbase</a> · <a href="${opts.baseUrl}/api/unsubscribe?token=${opts.unsubscribeToken}" style="color:#8b8f96">unsubscribe</a></p>
</div>`;
}

async function sendResendEmail(opts: {
  key: string; from: string; to: string; subject: string; html: string; fetchFn: typeof fetch;
}): Promise<void> {
  const res = await opts.fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${opts.key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) throw new Error(`resend: HTTP ${res.status}`);
}

export async function sendDigests(
  db: Db,
  opts: { resendKey: string; fromEmail: string; baseUrl: string; fetchFn?: typeof fetch; now?: Date },
): Promise<{ sent: number }> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const isMonday = now.getUTCDay() === 1;

  const subs = await db.select().from(subscribers).where(isNotNull(subscribers.confirmedAt));
  let sent = 0;
  for (const sub of subs) {
    if (sub.lastDigestSentAt && sub.lastDigestSentAt >= startOfToday) continue;
    if (sub.frequency === "weekly" && !isMonday) continue;
    const windowMs = sub.frequency === "daily" ? DAY_MS : 7 * DAY_MS;
    const cutoff = new Date(now.getTime() - windowMs);
    const items: DigestItem[] = await db.select({
      title: listings.title, companyName: listings.companyName, locations: listings.locations,
      isRemote: listings.isRemote, applyUrl: listings.applyUrl,
    }).from(listings)
      .where(and(eq(listings.isActive, true), gte(listings.firstSeenAt, cutoff)))
      .orderBy(desc(listings.postedAt), desc(listings.qualityScore))
      .limit(50);
    if (items.length === 0) continue;
    const label = sub.frequency === "daily" ? "today" : "this week";
    await sendResendEmail({
      key: opts.resendKey, from: opts.fromEmail, to: sub.email, fetchFn,
      subject: `${items.length} new entry-level internship${items.length === 1 ? "" : "s"} ${label}`,
      html: buildDigestHtml(items, { baseUrl: opts.baseUrl, unsubscribeToken: sub.unsubscribeToken, label }),
    });
    await db.update(subscribers).set({ lastDigestSentAt: now }).where(eq(subscribers.id, sub.id));
    sent++;
  }
  return { sent };
}
