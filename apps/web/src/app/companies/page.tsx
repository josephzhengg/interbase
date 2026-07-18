import Link from "next/link";
import { getDb } from "@/lib/db";
import { getCompaniesWithCounts } from "@/lib/queries";

export const revalidate = 3600;
export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const cos = await getCompaniesWithCounts(getDb());
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Companies</h1>
      <p className="mt-1 text-sm text-muted">Every company we track, with their open entry-level roles.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {cos.map((c) => (
          <li key={c.id}>
            <Link
              href={`/companies/${c.slug}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-muted"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 flex-none items-center justify-center rounded-md text-sm font-bold text-white"
                style={{ backgroundColor: c.logoColor }}
              >
                {c.name[0]}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-xs text-muted">
                  {c.activeCount} open internship{c.activeCount === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
