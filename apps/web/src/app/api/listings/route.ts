import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getListingsByIds } from "@/lib/queries";

export async function GET(req: Request) {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(
    idsParam
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 2_147_483_647),
  )].slice(0, 200);
  const rows = await getListingsByIds(getDb(), ids);
  return NextResponse.json({
    listings: rows.map((l) => ({ ...l, postedAt: l.postedAt.toISOString() })),
  });
}
