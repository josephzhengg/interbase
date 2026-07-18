import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getListingById } from "@/lib/queries";
import Home, { type SearchParams } from "@/app/page";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(getDb(), Number(id) || 0);
  if (!listing) return { title: "Listing not found" };
  const title = `${listing.title} at ${listing.companyName}`;
  const description =
    listing.descriptionSnippet.slice(0, 160) || `Entry-level internship at ${listing.companyName}.`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description },
  };
}

export default async function ListingPermalink({ params }: { params: Params }) {
  const { id } = await params;
  const listing = await getListingById(getDb(), Number(id) || 0);
  if (!listing) notFound();
  const sp: SearchParams = { sel: String(listing.id) };
  return Home({ searchParams: Promise.resolve(sp) });
}
