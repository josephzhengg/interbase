import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  if (token) {
    await getDb().delete(subscribers).where(eq(subscribers.unsubscribeToken, token));
  }
  return NextResponse.redirect(new URL("/?unsubscribed=1", baseUrl), 302);
}
