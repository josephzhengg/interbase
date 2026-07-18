import { getDb } from "@/lib/db";
import { getFeed, getListingById, type FeedFilters, type FeedListing } from "@/lib/queries";
import { FeedShell, type FeedListingDTO } from "@/components/FeedShell";

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
  const rows = await getFeed(db, filters);
  let dtos = rows.map(toDto);
  if (sel && !dtos.some((d) => d.id === sel)) {
    const extra = await getListingById(db, sel);
    if (extra) dtos = [toDto(extra), ...dtos];
  }
  return <FeedShell listings={dtos} initialSelectedId={sel} />;
}
