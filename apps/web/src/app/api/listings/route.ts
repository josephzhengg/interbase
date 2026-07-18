import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getListingsByIds } from "@/lib/queries";

export async function GET(req: Request) {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  const rows = await getListingsByIds(getDb(), ids);
  return NextResponse.json({
    listings: rows.map((l) => ({ ...l, postedAt: l.postedAt.toISOString() })),
  });
}
