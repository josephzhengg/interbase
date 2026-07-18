import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings, subscribers, type Db } from "@interbase/db";
import { eq } from "drizzle-orm";
import { sendDigests } from "./digest";

// Tuesday 2026-07-14 UTC
const NOW = new Date("2026-07-14T12:00:00Z");
// Monday 2026-07-13 UTC
const MONDAY = new Date("2026-07-13T12:00:00Z");

async function seed(db: Db, opts: { subFrequency?: "daily" | "weekly"; confirmed?: boolean } = {}) {
  const [co] = await db.insert(companies).values({
    name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
  }).returning();
  await db.insert(listings).values({
    companyId: co!.id, companyName: "Stripe", title: "SWE Intern", titleNorm: "swe intern",
    applyUrl: "https://x.com/1", urlCanon: "https://x.com/1", source: "greenhouse", externalId: "1",
    postedAt: NOW, firstSeenAt: new Date(NOW.getTime() - 3_600_000), lastSeenAt: NOW,
  });
  await db.insert(subscribers).values({
    email: "a@b.edu", frequency: opts.subFrequency ?? "daily",
    confirmToken: "c1", unsubscribeToken: "u1",
    confirmedAt: opts.confirmed === false ? null : NOW,
  });
}

function capture() {
  const calls: { url: string; body: string }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const OPTS = { resendKey: "k", fromEmail: "interbase <digest@test.local>", baseUrl: "http://test.local" };

describe("sendDigests", () => {
  it("sends to confirmed daily subscribers and is idempotent per day", async () => {
    const db = await createTestDb();
    await seed(db);
    const { calls, fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 1 });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.body).toContain("SWE Intern");
    expect(calls[0]!.body).toContain("/api/unsubscribe?token=u1");
    // same day again → no-op
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 });
  });

  it("skips unconfirmed subscribers", async () => {
    const db = await createTestDb();
    await seed(db, { confirmed: false });
    const { fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 });
  });

  it("weekly subscribers only get Monday sends", async () => {
    const db = await createTestDb();
    await seed(db, { subFrequency: "weekly" });
    const { fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 }); // Tuesday
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: MONDAY })).toEqual({ sent: 1 });
  });

  it("skips when there is nothing new in the window", async () => {
    const db = await createTestDb();
    await seed(db);
    const { fetchFn } = capture();
    const muchLater = new Date("2026-08-01T12:00:00Z");
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: muchLater })).toEqual({ sent: 0 });
  });

  it("escapes scraped HTML in email content", async () => {
    const db = await createTestDb();
    await seed(db);
    await db.update(listings).set({ title: '</a><a href="http://evil.example">SWE' });
    const { calls, fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 1 });
    const payload = JSON.parse(calls[0]!.body) as { html: string };
    expect(payload.html).toContain("&lt;/a&gt;");
    expect(payload.html).not.toContain('</a><a href="http://evil.example">');
  });

  it("isolates per-subscriber send failures and keeps going", async () => {
    const db = await createTestDb();
    await seed(db); // creates confirmed daily subscriber a@b.edu
    await db.insert(subscribers).values({
      email: "c@d.edu", frequency: "daily", confirmToken: "c2", unsubscribeToken: "u2", confirmedAt: NOW,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      if (body.includes("a@b.edu")) return new Response("{}", { status: 500 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 1 });
    expect(errSpy).toHaveBeenCalledOnce();
    errSpy.mockRestore();
    const rows = await db.select().from(subscribers);
    expect(rows.find((r) => r.email === "a@b.edu")!.lastDigestSentAt).toBeNull();
    expect(rows.find((r) => r.email === "c@d.edu")!.lastDigestSentAt).not.toBeNull();
  });
});
