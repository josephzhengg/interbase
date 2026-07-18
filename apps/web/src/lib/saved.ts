"use client";

import { useSyncExternalStore } from "react";

export interface SavedEntry { listingId: number; at: string }
type Kind = "saved" | "applied";
const KEYS: Record<Kind, string> = { saved: "interbase.saved", applied: "interbase.applied" };
const EMPTY: SavedEntry[] = [];

let listeners: (() => void)[] = [];
const snapshots = new Map<Kind, { raw: string; parsed: SavedEntry[] }>();

export function readEntries(kind: Kind): SavedEntry[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEYS[kind]) ?? "[]";
  const cached = snapshots.get(kind);
  if (cached && cached.raw === raw) return cached.parsed;
  let parsed: SavedEntry[];
  try {
    const json = JSON.parse(raw);
    parsed = Array.isArray(json) ? (json as SavedEntry[]) : [];
  } catch {
    parsed = [];
  }
  snapshots.set(kind, { raw, parsed });
  return parsed;
}

export function toggleEntry(kind: Kind, listingId: number): void {
  const entries = readEntries(kind);
  const next = entries.some((e) => e.listingId === listingId)
    ? entries.filter((e) => e.listingId !== listingId)
    : [...entries, { listingId, at: new Date().toISOString() }];
  window.localStorage.setItem(KEYS[kind], JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    window.removeEventListener("storage", cb);
  };
}

export function useEntries(kind: Kind): SavedEntry[] {
  return useSyncExternalStore(subscribe, () => readEntries(kind), () => EMPTY);
}
