"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/format";
import { toggleEntry, useEntries, type SavedEntry } from "@/lib/saved";
import { TagPill } from "@/components/TagPill";
import type { FeedListingDTO } from "@/components/FeedShell";

export default function SavedPage() {
  const saved = useEntries("saved");
  const applied = useEntries("applied");
  const [byId, setById] = useState<Map<number, FeedListingDTO> | null>(null);

  const key = [...new Set([...saved, ...applied].map((e) => e.listingId))].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!key) {
      setById(new Map());
      return;
    }
    fetch(`/api/listings?ids=${key}`)
      .then((r) => r.json())
      .then((data: { listings: FeedListingDTO[] }) =>
        setById(new Map(data.listings.map((l) => [l.id, l]))),
      )
      .catch(() => setById(new Map()));
  }, [key]);

  if (byId === null) return <p className="text-muted">Loading…</p>;

  function Row({ entry, kind }: { entry: SavedEntry; kind: "saved" | "applied" }) {
    const l = byId!.get(entry.listingId);
    if (!l) {
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
      <li className={`rounded-lg border border-border bg-surface px-3 py-2 ${l.isActive ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2.5">
          <a href={`/?sel=${l.id}`} className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{l.title}</span>
            <span className="block truncate text-xs text-muted">
              {l.companyName} · posted {relativeTime(l.postedAt)}
            </span>
          </a>
          {!l.isActive && <TagPill label="Expired" />}
          <a href={l.applyUrl} target="_blank" rel="noopener nofollow"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            Apply ↗
          </a>
          <button type="button" onClick={() => toggleEntry(kind, entry.listingId)}
            className="text-xs text-muted hover:text-ink">
            Remove
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold">Saved</h1>
      {saved.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing saved yet — press <kbd>s</kbd> on the feed or hit ☆ Save.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">{saved.map((e) => <Row key={e.listingId} entry={e} kind="saved" />)}</ul>
      )}
      <h1 className="mt-8 text-xl font-bold">Applied</h1>
      {applied.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Mark listings as applied to track your pipeline.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">{applied.map((e) => <Row key={e.listingId} entry={e} kind="applied" />)}</ul>
      )}
    </div>
  );
}
