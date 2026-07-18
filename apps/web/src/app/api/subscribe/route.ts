import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  frequency: z.enum(["daily", "weekly"]).default("daily"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { email, frequency } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email));
  if (existing?.confirmedAt) return NextResponse.json({ status: "already-subscribed" });
  let confirmToken: string;
  if (existing) {
    confirmToken = existing.confirmToken;
    await db.update(subscribers).set({ frequency }).where(eq(subscribers.id, existing.id));
  } else {
    confirmToken = randomUUID();
    await db.insert(subscribers).values({
      email, frequency, confirmToken, unsubscribeToken: randomUUID(),
    });
  }
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: "Confirm your interbase digest",
    html: `<p>Click to confirm your ${frequency} digest of new entry-level internships:</p>
<p><a href="${baseUrl}/api/confirm?token=${confirmToken}">Confirm subscription</a></p>
<p>If you didn't request this, ignore this email.</p>`,
  });
  return NextResponse.json({ status: "confirmation-sent" });
}
