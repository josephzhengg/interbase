"use client";

import { relativeTime } from "@/lib/format";
import { toggleEntry, useEntries } from "@/lib/saved";
import { TagPill } from "./TagPill";
import type { FeedListingDTO } from "./FeedShell";

export function DetailPanel({ listing }: { listing: FeedListingDTO | null }) {
  const saved = useEntries("saved");
  const applied = useEntries("applied");
  if (!listing) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
        Select a listing to see details.
      </div>
    );
  }
  const isSaved = saved.some((e) => e.listingId === listing.id);
  const isApplied = applied.some((e) => e.listingId === listing.id);
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <p className="text-xs text-muted">
        <a href={`/companies/${listing.companySlug}`} className="hover:text-accent">{listing.companyName}</a>
        {" · "}
        {listing.isRemote ? "Remote" : listing.locations.join(" · ") || "Location TBA"}
      </p>
      <h1 className="mt-1 text-lg font-bold tracking-tight">{listing.title}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {listing.season && <TagPill label={listing.season} />}
        {listing.tags.map((t) => <TagPill key={t} tag={t} />)}
      </div>
      <p className="mt-1.5 text-xs text-muted">Posted {relativeTime(listing.postedAt)}</p>
      {listing.descriptionSnippet && (
        <p className="mt-3 text-sm leading-relaxed">{listing.descriptionSnippet}</p>
      )}
      {!listing.isActive && (
        <p className="mt-3 rounded-md bg-bg px-3 py-2 text-xs text-muted">
          This listing looks closed or expired — the Apply link may no longer work.
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener nofollow"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Apply on {listing.companyName} ↗
        </a>
        <button
          type="button"
          onClick={() => toggleEntry("saved", listing.id)}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${isSaved ? "border-accent-border bg-accent-soft text-accent" : "border-border text-muted hover:text-ink"}`}
        >
          {isSaved ? "★ Saved" : "☆ Save"}
        </button>
        <button
          type="button"
          onClick={() => toggleEntry("applied", listing.id)}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${isApplied ? "border-border bg-ok-soft text-ok" : "border-border text-muted hover:text-ink"}`}
        >
          {isApplied ? "✓ Applied" : "Mark applied"}
        </button>
      </div>
    </article>
  );
}
