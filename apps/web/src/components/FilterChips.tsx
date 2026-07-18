"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { applyFilter } from "@/lib/urlstate";

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-accent-border bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function DebouncedInput({ initial, placeholder, onCommit, className }: {
  initial: string; placeholder: string; onCommit: (value: string) => void; className: string;
}) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <input
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        setValue(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(e.target.value), 300);
      }}
    />
  );
}

const INPUT_CLASS =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

export function FilterChips({ seasons }: { seasons: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const search = sp.toString();

  const nav = (key: string, value: string | null) =>
    router.replace(`${pathname}${applyFilter(search, key, value)}`, { scroll: false });
  const toggle = (key: string) => nav(key, sp.get(key) === "1" ? null : "1");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <DebouncedInput
        initial={sp.get("q") ?? ""}
        placeholder="Search roles or companies…"
        onCommit={(v) => nav("q", v || null)}
        className={`${INPUT_CLASS} w-full max-w-xs`}
      />
      <DebouncedInput
        initial={sp.get("loc") ?? ""}
        placeholder="Location"
        onCommit={(v) => nav("loc", v || null)}
        className={`${INPUT_CLASS} w-32`}
      />
      <Chip active={sp.get("remote") === "1"} onClick={() => toggle("remote")}>Remote OK</Chip>
      <Chip active={sp.get("visa") === "1"} onClick={() => toggle("visa")}>Sponsors visa</Chip>
      <Chip active={sp.get("frosh") === "1"} onClick={() => toggle("frosh")}>Freshman friendly</Chip>
      <select
        value={sp.get("season") ?? ""}
        onChange={(e) => nav("season", e.target.value || null)}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-muted focus:border-accent focus:outline-none"
      >
        <option value="">All seasons</option>
        {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
