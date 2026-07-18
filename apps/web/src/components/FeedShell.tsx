"use client";

import { useEffect, useMemo, useState } from "react";
import { groupListings, relativeTime } from "@/lib/format";
import { toggleEntry, useEntries } from "@/lib/saved";
import { DetailPanel } from "./DetailPanel";

export interface FeedListingDTO {
  id: number; title: string; companyName: string; companySlug: string; logoColor: string;
  applyUrl: string; descriptionSnippet: string; locations: string[]; isRemote: boolean;
  season: string | null; tags: string[]; postedAt: string; isActive: boolean;
}

export function nextId(ids: number[], currentId: number | null, delta: 1 | -1): number | null {
  if (ids.length === 0) return null;
  if (currentId == null) return ids[0]!;
  const i = ids.indexOf(currentId);
  if (i === -1) return ids[0]!;
  return ids[Math.min(ids.length - 1, Math.max(0, i + delta))]!;
}

export function FeedShell({
  listings, initialSelectedId,
}: { listings: FeedListingDTO[]; initialSelectedId?: number }) {
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSelectedId ?? listings[0]?.id ?? null,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const saved = useEntries("saved");
  const groups = useMemo(() => groupListings(listings), [listings]);
  const ids = useMemo(() => listings.map((l) => l.id), [listings]);
  const selected = listings.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSelectedId((c) => nextId(ids, c, 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSelectedId((c) => nextId(ids, c, -1));
      } else if (e.key === "Enter" && selected) {
        // Let focused buttons/links activate natively instead of double-firing.
        if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return;
        window.open(selected.applyUrl, "_blank", "noopener");
      } else if (e.key === "s" && selected) {
        toggleEntry("saved", selected.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, selected]);

  if (listings.length === 0) {
    return <p className="py-16 text-center text-muted">No internships match these filters yet — try widening them.</p>;
  }

  return (
    <div className="md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-4">
      <div>
        {groups.map((g) => (
          <section key={g.label}>
            <h2 className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted first:mt-0">
              {g.label === "New today" && <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />}
              {g.label} · {g.items.length}
            </h2>
            <ul className="space-y-1.5">
              {g.items.map((l) => {
                const isSel = l.id === selectedId;
                const isSaved = saved.some((e) => e.listingId === l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(l.id); setMobileOpen(true); }}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${isSel ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-muted"}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-xs font-bold text-white"
                          style={{ backgroundColor: l.logoColor }}
                        >
                          {l.companyName[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {isSaved && <span className="text-accent">★ </span>}
                            {l.title}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {l.companyName} · {l.isRemote ? "Remote" : l.locations[0] ?? "Location TBA"}
                            {l.locations.length > 1 && ` +${l.locations.length - 1}`} · {relativeTime(l.postedAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className={`${mobileOpen ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-4" : "hidden"} md:sticky md:top-20 md:block md:bg-transparent md:p-0`}>
        {mobileOpen && (
          <button type="button" onClick={() => setMobileOpen(false)} className="mb-3 text-sm text-accent md:hidden">
            ← Back to list
          </button>
        )}
        <DetailPanel listing={selected} />
      </div>
    </div>
  );
}
