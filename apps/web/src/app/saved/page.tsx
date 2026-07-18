"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/format";
import { toggleEntry, useEntries, type SavedEntry } from "@/lib/saved";
import { TagPill } from "@/components/TagPill";
import type { FeedListingDTO } from "@/components/FeedShell";

function Row({ entry, kind, listing }: {
  entry: SavedEntry;
  kind: "saved" | "applied";
  listing: FeedListingDTO | undefined;
}) {
  if (!listing) {
    return (
      <li className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
        Listing no longer available
        <button type="button" className="text-xs text-accent" onClick={() => toggleEntry(kind, entry.listingId)}>
          Remove
        </button>
      </li>
    );
  }
  return (
    <li className={`rounded-lg border border-border bg-surface px-3 py-2 ${listing.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2.5">
        <a href={`/?sel=${listing.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{listing.title}</span>
          <span className="block truncate text-xs text-muted">
            {listing.companyName} · posted {relativeTime(listing.postedAt)}
          </span>
        </a>
        {!listing.isActive && <TagPill label="Expired" />}
        <a
          href={listing.applyUrl}
          target="_blank"
          rel="noopener nofollow"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Apply ↗
        </a>
        <button
          type="button"
          onClick={() => toggleEntry(kind, entry.listingId)}
          className="text-xs text-muted hover:text-ink"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function SavedPage() {
  const saved = useEntries("saved");
  const applied = useEntries("applied");
  const [byId, setById] = useState<Map<number, FeedListingDTO> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = [...new Set([...saved, ...applied].map((e) => e.listingId))]
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!key) {
      setById(new Map());
      setFailed(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/listings?ids=${key}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { listings: FeedListingDTO[] }) => {
        if (cancelled) return;
        setById(new Map(data.listings.map((l) => [l.id, l])));
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setById(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  if (failed) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted">
        <p>Couldn't load your saved listings.</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="mt-2 font-medium text-accent hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
  if (byId === null) return <p className="text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold">Saved</h1>
      {saved.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing saved yet — press <kbd>s</kbd> on the feed or hit ☆ Save.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {saved.map((e) => (
            <Row key={e.listingId} entry={e} kind="saved" listing={byId.get(e.listingId)} />
          ))}
        </ul>
      )}
      <h1 className="mt-8 text-xl font-bold">Applied</h1>
      {applied.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Mark listings as applied to track your pipeline.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {applied.map((e) => (
            <Row key={e.listingId} entry={e} kind="applied" listing={byId.get(e.listingId)} />
          ))}
        </ul>
      )}
    </div>
  );
}
