import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@interbase/db/testing";
import { subscribers, type Db } from "@interbase/db";
import { setDb } from "@/lib/db";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
import { sendEmail } from "@/lib/email";
import { POST } from "./route";
import { GET as CONFIRM } from "../confirm/route";
import { GET as UNSUBSCRIBE } from "../unsubscribe/route";

const mockSend = vi.mocked(sendEmail);
let db: Db;

function post(body: unknown) {
  return POST(new Request("http://test/api/subscribe", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(async () => {
  db = await createTestDb();
  setDb(db);
  mockSend.mockClear();
  process.env.BASE_URL = "http://test.local";
});

describe("subscribe flow", () => {
  it("creates an unconfirmed subscriber and emails a confirm link", async () => {
    const res = await post({ email: "student@school.edu", frequency: "daily" });
    expect(((await res.json()) as { status: string }).status).toBe("confirmation-sent");
    const [row] = await db.select().from(subscribers);
    expect(row!.confirmedAt).toBeNull();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0]![0].html).toContain(`http://test.local/api/confirm?token=${row!.confirmToken}`);
  });

  it("rejects invalid emails", async () => {
    expect((await post({ email: "nope" })).status).toBe(400);
  });

  it("confirm sets confirmedAt and redirects; bad token redirects with =0", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    const ok = await CONFIRM(new Request(`http://test/api/confirm?token=${row!.confirmToken}`));
    expect(ok.headers.get("location")).toBe("http://test.local/?subscribed=1");
    const [after] = await db.select().from(subscribers);
    expect(after!.confirmedAt).not.toBeNull();
    const bad = await CONFIRM(new Request("http://test/api/confirm?token=wrong"));
    expect(bad.headers.get("location")).toBe("http://test.local/?subscribed=0");
  });

  it("already-confirmed emails do not get a second confirmation", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    await db.update(subscribers).set({ confirmedAt: new Date() }).where(eq(subscribers.id, row!.id));
    mockSend.mockClear();
    const res = await post({ email: "a@b.edu" });
    expect(((await res.json()) as { status: string }).status).toBe("already-subscribed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("unsubscribe deletes the row", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    const res = await UNSUBSCRIBE(new Request(`http://test/api/unsubscribe?token=${row!.unsubscribeToken}`));
    expect(res.headers.get("location")).toBe("http://test.local/?unsubscribed=1");
    expect(await db.select().from(subscribers)).toHaveLength(0);
  });
});
