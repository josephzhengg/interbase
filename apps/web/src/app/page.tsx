import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  getFeed, getListingById, getSeasons, PAGE_SIZE, type FeedFilters, type FeedListing,
} from "@/lib/queries";
import { FeedShell, type FeedListingDTO } from "@/components/FeedShell";
import { FilterChips } from "@/components/FilterChips";
import { withPage } from "@/lib/urlstate";

export const dynamic = "force-dynamic";

export type SearchParams = Record<string, string | string[] | undefined>;

// NOT exported: Next.js page files reject unknown runtime exports (type exports are fine).
function parseFilters(sp: SearchParams): FeedFilters & { sel?: number } {
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  return {
    q: str("q"),
    location: str("loc"),
    remote: sp.remote === "1",
    season: str("season"),
    visa: sp.visa === "1",
    frosh: sp.frosh === "1",
    page: Number(str("page") ?? "1") || 1,
    sel: Number(str("sel") ?? "") || undefined,
  };
}

function toDto(l: FeedListing): FeedListingDTO {
  return { ...l, postedAt: l.postedAt.toISOString() };
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { sel, ...filters } = parseFilters(sp);
  const db = getDb();
  const [rows, seasons] = await Promise.all([getFeed(db, filters), getSeasons(db)]);
  let dtos = rows.map(toDto);
  if (sel && !dtos.some((d) => d.id === sel)) {
    const extra = await getListingById(db, sel);
    if (extra) dtos = [toDto(extra), ...dtos];
  }
  const currentSearch = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
  ).toString();
  return (
    <div>
      <Suspense fallback={null}>
        <FilterChips seasons={seasons} />
      </Suspense>
      <FeedShell listings={dtos} initialSelectedId={sel} />
      {rows.length >= PAGE_SIZE * (filters.page ?? 1) && (
        <div className="mt-6 text-center">
          <Link
            href={withPage(currentSearch, (filters.page ?? 1) + 1)}
            scroll={false}
            className="text-sm font-medium text-accent hover:underline"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
