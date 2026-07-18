import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCompanyBySlug } from "@/lib/queries";
import { relativeTime } from "@/lib/format";
import { TagPill } from "@/components/TagPill";

export const revalidate = 3600;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCompanyBySlug(getDb(), slug);
  if (!data) return { title: "Company not found" };
  return {
    title: `${data.company.name} internships`,
    description: `${data.listings.length} open entry-level internships at ${data.company.name}, updated daily on interbase.`,
  };
}

export default async function CompanyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getCompanyBySlug(getDb(), slug);
  if (!data) notFound();
  const { company, listings } = data;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-lg font-bold text-white"
          style={{ backgroundColor: company.logoColor }}
        >
          {company.name[0]}
        </span>
        <div>
          <h1 className="text-xl font-bold">{company.name}</h1>
          <p className="text-sm text-muted">
            {listings.length} open internship{listings.length === 1 ? "" : "s"}
            {company.website && (
              <>
                {" · "}
                <a href={company.website} target="_blank" rel="noopener nofollow" className="hover:text-accent">
                  {new URL(company.website).host}
                </a>
              </>
            )}
          </p>
        </div>
      </div>
      {listings.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No open entry-level roles right now — check back soon.</p>
      ) : (
        <ul className="mt-5 space-y-1.5">
          {listings.map((l) => (
            <li key={l.id} className="rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="flex items-center gap-3">
                <a href={`/?sel=${l.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{l.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {l.isRemote ? "Remote" : l.locations.join(" · ") || "Location TBA"} · posted {relativeTime(l.postedAt.toISOString())}
                  </span>
                </a>
                <span className="hidden gap-1 sm:flex">
                  {l.tags.slice(0, 2).map((t) => <TagPill key={t} tag={t} />)}
                </span>
                <a href={l.applyUrl} target="_blank" rel="noopener nofollow"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  Apply ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
