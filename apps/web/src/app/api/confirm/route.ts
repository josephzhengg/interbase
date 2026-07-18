import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const rows = token
    ? await getDb().update(subscribers).set({ confirmedAt: new Date() })
        .where(eq(subscribers.confirmToken, token)).returning()
    : [];
  return NextResponse.redirect(new URL(rows.length ? "/?subscribed=1" : "/?subscribed=0", baseUrl), 302);
}
