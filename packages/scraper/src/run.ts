import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Db } from "@interbase/db";
import { fetchAshby } from "./adapters/ashby";
import { fetchGreenhouse } from "./adapters/greenhouse";
import { fetchLever } from "./adapters/lever";
import { fetchSimplify } from "./adapters/simplify";
import { crossSourceDedupe, expireListings, upsertCompanies, upsertListings } from "./persist";
import { seedCompanySchema, type RawListing, type SeedCompany } from "./types";

export interface RunSummary {
  fetched: number; kept: number; skipped: number;
  deduped: number; expired: number; errors: string[];
}

const ADAPTERS = { greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby } as const;

export function loadSeed(): SeedCompany[] {
  const json = JSON.parse(readFileSync(new URL("../companies.seed.json", import.meta.url), "utf8"));
  return z.array(seedCompanySchema).parse(json);
}

export async function runScrape(
  db: Db,
  opts: { seed?: SeedCompany[]; simplifyRepo?: string; fetchFn?: typeof fetch; now?: Date } = {},
): Promise<RunSummary> {
  const seed = opts.seed ?? loadSeed();
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? new Date();
  const repo = opts.simplifyRepo ?? process.env.SIMPLIFY_REPO ?? "SimplifyJobs/Summer2026-Internships";
  const errors: string[] = [];
  const raws: RawListing[] = [];

  await upsertCompanies(db, seed);
  for (const c of seed) {
    try {
      raws.push(...(await ADAPTERS[c.atsType](c, fetchFn)));
    } catch (e) {
      errors.push(String(e));
    }
  }
  try {
    raws.push(...(await fetchSimplify(repo, fetchFn)));
  } catch (e) {
    errors.push(String(e));
  }

  const { kept, skipped } = await upsertListings(db, raws, {
    knownSlugs: new Set(seed.map((s) => s.slug)), now,
  });
  const deduped = await crossSourceDedupe(db);
  const expired = await expireListings(db, now);
  return { fetched: raws.length, kept, skipped, deduped, expired, errors };
}
