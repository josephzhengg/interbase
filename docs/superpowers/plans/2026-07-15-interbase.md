# interbase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build interbase — a public site that scrapes entry-level CS internships daily from public ATS APIs + the SimplifyJobs GitHub list into Postgres, and serves a split-view Paper-styled feed with saves, company pages, and an email digest.

**Architecture:** pnpm monorepo with three units: `packages/db` (Drizzle schema + Neon/PGlite client, the only shared dependency), `packages/scraper` (adapters → filter → score → upsert pipeline + digest sender, run by GitHub Actions cron), and `apps/web` (Next.js App Router on Vercel, reads the DB via server components). The scraper writes the DB; the web app reads it (plus writes `subscribers`); they never import each other.

**Tech Stack:** TypeScript (strict, ESM), Node 22, pnpm 9, Next.js 15, React 19, Tailwind CSS v4, Drizzle ORM + drizzle-kit, Neon Postgres (prod) / PGlite (tests + local dev), Zod, Vitest, Playwright, Resend (via raw `fetch`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-15-interbase-design.md` — read it before starting any task.

## Global Constraints

- Node >= 22, `packageManager: pnpm@9.15.0`, `"type": "module"` everywhere, TypeScript `strict: true`.
- Data sources are ONLY: Greenhouse/Lever/Ashby public JSON APIs and the SimplifyJobs GitHub `listings.json`. Never add LinkedIn/Indeed/any source that prohibits scraping.
- `apps/web` and `packages/scraper` must never import from each other. Both may import `@interbase/db`.
- Tag vocabulary is exactly: `paid`, `sponsors-visa`, `no-sponsorship`, `new-grad-ok`, `freshman-ok`.
- `quality_score` is 0–100 and is used for ranking ONLY — never to exclude a listing.
- Apply links always: `target="_blank" rel="noopener nofollow"`.
- Paper design tokens (all UI colors come from these CSS variables, no ad-hoc hex in components): bg `#fafafa`, surface `#ffffff`, border `#e7e8ea`, ink `#17181a`, muted `#8b8f96`, accent `#4f46e5`, accent-soft `#eef0fe`, accent-border `#c9cdf7`, ok `#189a4e`, ok-soft `#e9f8ef`. Radius: 8px cards, 6px controls.
- Free-tier services only: Vercel Hobby, Neon Free, GitHub Actions (public repo), Resend Free.
- Env var names (exact): `DATABASE_URL` (supports `postgres://…` for Neon and `pglite://<dir>` or `pglite://memory` for local/tests), `RESEND_API_KEY`, `FROM_EMAIL`, `BASE_URL`, `SIMPLIFY_REPO` (default `SimplifyJobs/Summer2027-Internships`).
- Tests accompany the code they test in the same commit. Conventional commits: `feat:`, `fix:`, `test:`, `chore:`.
- No live network in unit tests — adapters take an injectable `fetchFn`; DB tests run on in-memory PGlite.

## File Structure

```
interbase/
├── package.json                      # workspace root, scripts: test/typecheck
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .github/workflows/scrape.yml     # cron: scrape + digest
├── packages/db/
│   ├── package.json                 # @interbase/db
│   ├── drizzle.config.ts
│   ├── drizzle/                     # generated SQL migrations (committed)
│   └── src/
│       ├── schema.ts                # companies, listings, subscribers + enums
│       ├── client.ts                # createDb(url) → neon-http | pglite; type Db
│       ├── index.ts                 # public exports
│       ├── testing.ts               # createTestDb() — in-memory PGlite + migrations
│       ├── seed-dev.ts              # local/e2e sample data
│       └── schema.test.ts
├── packages/scraper/
│   ├── package.json                 # @interbase/scraper
│   ├── companies.seed.json          # curated companies + ATS tokens
│   └── src/
│       ├── types.ts                 # RawListing zod schema, SeedCompany
│       ├── normalize.ts             # htmlToText, canonicalUrl, normalizeTitle, parseSeason, slugify, logoColor, snippet
│       ├── rules.ts                 # isEntryLevel, extractTags, scoreListing
│       ├── adapters/greenhouse.ts   # fetchGreenhouse
│       ├── adapters/lever.ts        # fetchLever
│       ├── adapters/ashby.ts        # fetchAshby
│       ├── adapters/simplify.ts     # fetchSimplify (github_list)
│       ├── persist.ts               # upsertCompanies, upsertListings, crossSourceDedupe, expireListings
│       ├── run.ts                   # runScrape orchestrator
│       ├── cli.ts                   # scrape entrypoint
│       ├── digest.ts                # buildDigestHtml, sendDigests
│       ├── cli-digest.ts            # digest entrypoint
│       └── *.test.ts + tests/fixtures/*.json + tests/helpers.ts
└── apps/web/
    ├── package.json                 # web
    ├── next.config.ts               # transpilePackages, serverExternalPackages
    ├── postcss.config.mjs
    ├── playwright.config.ts
    ├── e2e/setup.ts, e2e/feed.spec.ts
    └── src/
        ├── app/layout.tsx           # header nav + footer (SubscribeForm)
        ├── app/globals.css          # Paper tokens
        ├── app/page.tsx             # feed (split view)
        ├── app/saved/page.tsx
        ├── app/companies/page.tsx
        ├── app/companies/[slug]/page.tsx
        ├── app/l/[id]/page.tsx      # share permalink (noindex)
        ├── app/api/listings/route.ts
        ├── app/api/subscribe/route.ts
        ├── app/api/confirm/route.ts
        ├── app/api/unsubscribe/route.ts
        ├── components/FeedShell.tsx # client: list + selection + keyboard + mobile sheet
        ├── components/DetailPanel.tsx
        ├── components/TagPill.tsx
        ├── components/FilterChips.tsx
        ├── components/SubscribeForm.tsx
        └── lib/db.ts, lib/queries.ts, lib/format.ts, lib/urlstate.ts, lib/saved.ts, lib/email.ts
```

Phases: Tasks 1–11 = Phase 1 (foundation + scraper: DB fills itself). Tasks 12–19 = Phase 2 (browsable site). Tasks 20–23 = Phase 3 (email, e2e, ship).

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace layout `apps/*`, `packages/*`; `tsconfig.base.json` every package extends; root scripts `pnpm test` / `pnpm typecheck` that recurse into packages.

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "interbase",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: Create .nvmrc**

```
22
```

- [ ] **Step 5: Append build/data dirs to .gitignore**

Append these lines to the existing `.gitignore`:

```
.data/
playwright-report/
test-results/
```

- [ ] **Step 6: Verify install works**

Run: `pnpm install`
Expected: succeeds, creates `pnpm-lock.yaml`. `pnpm test` prints "No projects matched the filters" or exits 0 (no packages yet — both fine).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2: `@interbase/db` — schema, client, migrations, test harness

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/src/testing.ts`
- Create: `packages/db/src/schema.test.ts`
- Generated: `packages/db/drizzle/` (committed)

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - Tables: `companies`, `listings`, `subscribers`; enums `atsTypeEnum` (`greenhouse|lever|ashby|github_list`), `digestFrequencyEnum` (`daily|weekly`). All exported from `@interbase/db`.
  - `createDb(url: string): Db` — `postgres://` → neon-http driver, `pglite://memory` → in-memory PGlite, `pglite://<dir>` → file PGlite.
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>` — every function that touches the DB takes this.
  - `createTestDb(): Promise<Db>` from `@interbase/db/testing` — fresh in-memory PGlite with all migrations applied.
  - Listing columns (exact names used later): `id, companyId, companyName, title, titleNorm, applyUrl, urlCanon, descriptionSnippet, locations, isRemote, season, tags, qualityScore, source, externalId, postedAt, firstSeenAt, lastSeenAt, isActive, search`.

- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "@interbase/db",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "seed:dev": "tsx src/seed-dev.ts"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.2.15",
    "@neondatabase/serverless": "^0.10.4",
    "drizzle-orm": "^0.36.4"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.1",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

(`seed:dev` script points at a file created in Task 13 — the script key is inert until then.)

- [ ] **Step 2: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Create packages/db/drizzle.config.ts**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://placeholder" },
});
```

- [ ] **Step 4: Write the failing test**

`packages/db/src/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./testing";
import { companies, listings } from "./schema";

describe("schema", () => {
  it("round-trips a company and listing, and full-text search matches", async () => {
    const db = await createTestDb();
    const [co] = await db
      .insert(companies)
      .values({ name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff" })
      .returning();
    await db.insert(listings).values({
      companyId: co!.id,
      companyName: "Stripe",
      title: "Software Engineering Intern, Summer 2027",
      titleNorm: "software engineering intern",
      applyUrl: "https://stripe.com/jobs/1",
      urlCanon: "https://stripe.com/jobs/1",
      source: "greenhouse",
      externalId: "1",
      postedAt: new Date(),
    });
    const hits = await db
      .select({ id: listings.id })
      .from(listings)
      .where(sql`${listings.search} @@ websearch_to_tsquery('english', 'engineering stripe')`);
    expect(hits).toHaveLength(1);
  });

  it("rejects duplicate (source, externalId)", async () => {
    const db = await createTestDb();
    const [co] = await db
      .insert(companies)
      .values({ name: "Ramp", slug: "ramp", atsType: "ashby", atsToken: "ramp", logoColor: "#0b1f3a" })
      .returning();
    const row = {
      companyId: co!.id, companyName: "Ramp", title: "Backend Intern", titleNorm: "backend intern",
      applyUrl: "https://ramp.com/jobs/2", urlCanon: "https://ramp.com/jobs/2",
      source: "ashby" as const, externalId: "2", postedAt: new Date(),
    };
    await db.insert(listings).values(row);
    await expect(db.insert(listings).values(row)).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm install && pnpm -F @interbase/db test`
Expected: FAIL — cannot resolve `./testing` / `./schema`.

- [ ] **Step 6: Create packages/db/src/schema.ts**

```ts
import { sql, type SQL } from "drizzle-orm";
import {
  boolean, customType, index, integer, pgEnum, pgTable, serial, text,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const atsTypeEnum = pgEnum("ats_type", ["greenhouse", "lever", "ashby", "github_list"]);
export const digestFrequencyEnum = pgEnum("digest_frequency", ["daily", "weekly"]);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  website: text("website"),
  atsType: atsTypeEnum("ats_type").notNull(),
  atsToken: text("ats_token"),
  logoColor: text("logo_color").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    titleNorm: text("title_norm").notNull(),
    applyUrl: text("apply_url").notNull(),
    urlCanon: text("url_canon").notNull(),
    descriptionSnippet: text("description_snippet").notNull().default(""),
    locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
    isRemote: boolean("is_remote").notNull().default(false),
    season: text("season"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    qualityScore: integer("quality_score").notNull().default(0),
    source: atsTypeEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${listings.title}, '') || ' ' || coalesce(${listings.companyName}, ''))`,
    ),
  },
  (t) => [
    uniqueIndex("listings_source_external_id").on(t.source, t.externalId),
    index("listings_active_posted").on(t.isActive, t.postedAt),
    index("listings_search_idx").using("gin", t.search),
  ],
);

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  frequency: digestFrequencyEnum("frequency").notNull().default("daily"),
  confirmToken: text("confirm_token").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  lastDigestSentAt: timestamp("last_digest_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 7: Create packages/db/src/client.ts**

```ts
import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string): Db {
  if (url.startsWith("pglite://")) {
    const path = url.slice("pglite://".length);
    const client = path === "memory" ? new PGlite() : new PGlite(path);
    return drizzlePglite(client, { schema }) as unknown as Db;
  }
  return drizzleNeon(neon(url), { schema }) as unknown as Db;
}
```

- [ ] **Step 8: Create packages/db/src/index.ts**

```ts
export * from "./schema";
export { createDb, type Db } from "./client";
```

- [ ] **Step 9: Create packages/db/src/testing.ts**

```ts
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import type { Db } from "./client";

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  return db as unknown as Db;
}
```

- [ ] **Step 10: Generate the migration**

Run: `pnpm -F @interbase/db generate`
Expected: creates `packages/db/drizzle/0000_*.sql` containing `CREATE TABLE` for all three tables, the enums, the generated `search` column, and the three listing indexes. Open the SQL file and confirm the `search` column line says `GENERATED ALWAYS AS ... STORED`.

- [ ] **Step 11: Run tests to verify they pass**

Run: `pnpm -F @interbase/db test`
Expected: 2 passed.

- [ ] **Step 12: Typecheck and commit**

```bash
pnpm -F @interbase/db typecheck
git add -A && git commit -m "feat: db package with schema, dual-driver client, migrations, test harness"
```

---

### Task 3: Scraper package + text/url normalization utilities

**Files:**
- Create: `packages/scraper/package.json`, `packages/scraper/tsconfig.json`, `packages/scraper/src/normalize.ts`
- Test: `packages/scraper/src/normalize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact signatures, used by adapters and persist):
  - `htmlToText(html: string): string` — decodes common HTML entities, strips tags, collapses whitespace.
  - `canonicalUrl(url: string): string` — drops query/fragment, lowercases host, strips trailing slash; returns input unchanged if unparseable.
  - `normalizeTitle(title: string): string` — lowercase, season phrases removed, non-alphanumerics collapsed to single spaces.
  - `parseSeason(title: string): string | null` — e.g. `"Summer 2027"`.
  - `slugify(name: string): string`
  - `logoColor(name: string): string` — deterministic hex from an 8-color palette.
  - `snippet(text: string, max?: number): string` — word-boundary truncation at 500 chars with `…`.

- [ ] **Step 1: Create packages/scraper/package.json**

```json
{
  "name": "@interbase/scraper",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "scrape": "tsx src/cli.ts",
    "digest": "tsx src/cli-digest.ts"
  },
  "dependencies": {
    "@interbase/db": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

(`scrape`/`digest` scripts point at files created in Tasks 10 and 21.)

- [ ] **Step 2: Create packages/scraper/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing tests**

`packages/scraper/src/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canonicalUrl, htmlToText, logoColor, normalizeTitle, parseSeason, slugify, snippet,
} from "./normalize";

describe("htmlToText", () => {
  it("decodes escaped HTML (Greenhouse-style) and strips tags", () => {
    expect(htmlToText("&lt;p&gt;We pay &amp;#36;45&amp;#47;hr&lt;/p&gt;")).toBe("We pay $45/hr");
  });
  it("strips plain tags and collapses whitespace", () => {
    expect(htmlToText("<div>Hello   <b>world</b>\n</div>")).toBe("Hello world");
  });
});

describe("canonicalUrl", () => {
  it("drops query, fragment, trailing slash; lowercases host", () => {
    expect(canonicalUrl("https://Boards.Greenhouse.io/stripe/jobs/123/?gh_src=abc#top"))
      .toBe("https://boards.greenhouse.io/stripe/jobs/123");
  });
  it("returns garbage input unchanged", () => {
    expect(canonicalUrl("not a url")).toBe("not a url");
  });
});

describe("normalizeTitle", () => {
  it("lowercases, removes season, collapses punctuation", () => {
    expect(normalizeTitle("Software Engineering Intern, Summer 2027 (Remote)"))
      .toBe("software engineering intern remote");
  });
});

describe("parseSeason", () => {
  it("extracts season with capitalization", () => {
    expect(parseSeason("SWE Intern - summer 2027")).toBe("Summer 2027");
    expect(parseSeason("Fall2026 Data Intern")).toBe("Fall 2026");
    expect(parseSeason("Backend Intern")).toBeNull();
  });
});

describe("slugify", () => {
  it("kebab-cases company names", () => {
    expect(slugify("Jane Street Capital")).toBe("jane-street-capital");
    expect(slugify("J.P. Morgan & Co.")).toBe("j-p-morgan-co");
  });
});

describe("logoColor", () => {
  it("is deterministic and returns a palette hex", () => {
    expect(logoColor("Stripe")).toBe(logoColor("Stripe"));
    expect(logoColor("Stripe")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("snippet", () => {
  it("returns short text unchanged", () => {
    expect(snippet("hello world")).toBe("hello world");
  });
  it("truncates at a word boundary with ellipsis", () => {
    const long = "word ".repeat(200).trim();
    const s = snippet(long, 50);
    expect(s.length).toBeLessThanOrEqual(51);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("wor…");
  });
});
```

Note: Greenhouse double-escapes its `content` field, so `&amp;#36;` must decode to `&#36;` and then to `$` — `htmlToText` needs two decode rounds and numeric-entity handling (`&#(\d+);`).

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm install && pnpm -F @interbase/scraper test`
Expected: FAIL — `./normalize` not found.

- [ ] **Step 5: Implement packages/scraper/src/normalize.ts**

```ts
const SEASON_RE = /(summer|fall|winter|spring)\s*(20\d{2})/i;

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-escapes: decode twice, entities-before-tags each round.
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, "&");
  }
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.host = u.host.toLowerCase();
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(new RegExp(SEASON_RE.source, "gi"), " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseSeason(title: string): string | null {
  const m = title.match(SEASON_RE);
  if (!m) return null;
  const term = m[1]!.toLowerCase();
  return `${term[0]!.toUpperCase()}${term.slice(1)} ${m[2]}`;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const PALETTE = ["#4f46e5", "#0d9463", "#b45309", "#be123c", "#0369a1", "#7c3aed", "#0f766e", "#a21caf"];

export function logoColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function snippet(text: string, max = 500): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: all normalize tests PASS. If the double-escape test fails, check decode ordering: `&amp;` must decode last within each round.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scraper normalization utilities"
```

---

### Task 4: RawListing type + entry-level filter, tags, quality score

**Files:**
- Create: `packages/scraper/src/types.ts`, `packages/scraper/src/rules.ts`
- Test: `packages/scraper/src/rules.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure).
- Produces (exact, used by all adapters + persist):

```ts
// types.ts
import { z } from "zod";

export const rawListingSchema = z.object({
  source: z.enum(["greenhouse", "lever", "ashby", "github_list"]),
  externalId: z.string().min(1),
  companyName: z.string().min(1),
  companySlug: z.string().min(1),
  title: z.string().min(1),
  applyUrl: z.string().url(),
  locations: z.array(z.string()).default([]),
  isRemote: z.boolean().default(false),
  descriptionText: z.string().default(""),
  hasCompensationData: z.boolean().default(false),
  sponsorship: z.enum(["yes", "no"]).nullable().default(null),
  season: z.string().nullable().default(null),
  postedAt: z.coerce.date().nullable().default(null),
});
export type RawListing = z.infer<typeof rawListingSchema>;

export const seedCompanySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  website: z.string().url().optional(),
  atsType: z.enum(["greenhouse", "lever", "ashby"]),
  atsToken: z.string().min(1),
});
export type SeedCompany = z.infer<typeof seedCompanySchema>;
```

  - `isEntryLevel(title: string): boolean`
  - `extractTags(raw: RawListing): string[]` — subset of the exact tag vocabulary.
  - `scoreListing(args: { raw: RawListing; tags: string[]; isKnownCompany: boolean; now: Date }): number` — 0–100.

- [ ] **Step 1: Create packages/scraper/src/types.ts**

Use exactly the code shown in the Interfaces block above.

- [ ] **Step 2: Write the failing tests**

`packages/scraper/src/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractTags, isEntryLevel, scoreListing } from "./rules";
import { rawListingSchema, type RawListing } from "./types";

function raw(overrides: Partial<RawListing> = {}): RawListing {
  return rawListingSchema.parse({
    source: "greenhouse", externalId: "1", companyName: "Acme", companySlug: "acme",
    title: "Software Engineering Intern", applyUrl: "https://acme.com/jobs/1",
    ...overrides,
  });
}

describe("isEntryLevel", () => {
  it.each([
    ["Software Engineering Intern, Summer 2027", true],
    ["Software Engineer Co-op", true],
    ["Co-Op Software Developer", true],
    ["New Grad Software Engineer", true],
    ["Entry-Level Data Engineer", true],
    ["Senior Software Engineer", false],
    ["Staff Machine Learning Engineer", false],
    ["Machine Learning Intern (PhD)", false],
    ["Engineering Manager, Internal Tools", false],
    ["Internal Communications Coordinator", false], // "Internal" must NOT match \bintern\b
    ["Software Engineer", false], // no entry-level signal at all
  ])("%s → %s", (title, expected) => {
    expect(isEntryLevel(title)).toBe(expected);
  });
});

describe("extractTags", () => {
  it("detects paid from description dollars or compensation data", () => {
    expect(extractTags(raw({ descriptionText: "Pay: $45/hour plus housing" }))).toContain("paid");
    expect(extractTags(raw({ hasCompensationData: true }))).toContain("paid");
  });
  it("negative sponsorship wins over the word 'sponsor'", () => {
    const tags = extractTags(raw({ descriptionText: "We are unable to sponsor work visas." }));
    expect(tags).toContain("no-sponsorship");
    expect(tags).not.toContain("sponsors-visa");
  });
  it("positive sponsorship detected from description and structured field", () => {
    expect(extractTags(raw({ descriptionText: "We sponsor visas and support CPT/OPT." }))).toContain("sponsors-visa");
    expect(extractTags(raw({ sponsorship: "yes" }))).toContain("sponsors-visa");
    expect(extractTags(raw({ sponsorship: "no" }))).toContain("no-sponsorship");
  });
  it("new-grad-ok and freshman-ok", () => {
    expect(extractTags(raw({ title: "New Grad Software Engineer" }))).toContain("new-grad-ok");
    expect(extractTags(raw({ descriptionText: "Open to freshman and sophomore students" }))).toContain("freshman-ok");
  });
  it("empty description yields no tags", () => {
    expect(extractTags(raw())).toEqual([]);
  });
});

describe("scoreListing", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  it("full rubric sums to 100", () => {
    const r = raw({
      descriptionText: "x".repeat(300),
      locations: ["New York, NY"],
      postedAt: new Date("2026-07-14T12:00:00Z"),
    });
    const score = scoreListing({ raw: r, tags: ["paid", "sponsors-visa"], isKnownCompany: true, now });
    expect(score).toBe(100);
  });
  it("bare unknown-company stale listing scores 0", () => {
    const r = raw({ postedAt: new Date("2026-06-01T00:00:00Z") });
    expect(scoreListing({ raw: r, tags: [], isKnownCompany: false, now })).toBe(0);
  });
  it("null postedAt counts as fresh (it will be stamped first_seen now)", () => {
    const r = raw({ postedAt: null });
    expect(scoreListing({ raw: r, tags: [], isKnownCompany: false, now })).toBe(15);
  });
  it("no-sponsorship still earns the clarity points", () => {
    const r = raw({ postedAt: new Date("2026-06-01T00:00:00Z") });
    expect(scoreListing({ raw: r, tags: ["no-sponsorship"], isKnownCompany: false, now })).toBe(15);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./rules` not found.

- [ ] **Step 4: Implement packages/scraper/src/rules.ts**

```ts
import type { RawListing } from "./types";

const INTERN_RE = /\b(intern(ship)?|co[- ]?op)\b/i;
const NEW_GRAD_RE = /\b(new grad(uate)?|university grad(uate)?|early career|entry[- ]level)\b/i;
const EXCLUDE_RE = /\b(senior|staff|principal|lead|manager|director|architect|phd|mba)\b/i;

export function isEntryLevel(title: string): boolean {
  return (INTERN_RE.test(title) || NEW_GRAD_RE.test(title)) && !EXCLUDE_RE.test(title);
}

const PAID_RE = /\$\s?\d|\/(hour|hr)\b|hourly|stipend/i;
const NO_SPONSOR_RE = /(unable|not able|cannot|will not|no)\s+(?:\w+\s+){0,3}sponsor/i;
const SPONSOR_RE = /sponsor(ship)?|\bCPT\b|\bOPT\b/i;
const FRESHMAN_RE = /freshman|sophomore|all years|underclassmen|first[- ]year students/i;

export function extractTags(raw: RawListing): string[] {
  const d = raw.descriptionText;
  const tags: string[] = [];
  if (raw.hasCompensationData || PAID_RE.test(d)) tags.push("paid");
  const noSponsor = raw.sponsorship === "no" || NO_SPONSOR_RE.test(d);
  if (noSponsor) tags.push("no-sponsorship");
  else if (raw.sponsorship === "yes" || SPONSOR_RE.test(d)) tags.push("sponsors-visa");
  if (NEW_GRAD_RE.test(raw.title) || NEW_GRAD_RE.test(d)) tags.push("new-grad-ok");
  if (FRESHMAN_RE.test(d)) tags.push("freshman-ok");
  return tags;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function scoreListing(args: {
  raw: RawListing; tags: string[]; isKnownCompany: boolean; now: Date;
}): number {
  const { raw, tags, isKnownCompany, now } = args;
  let score = 0;
  if (isKnownCompany) score += 30;
  if (tags.includes("paid")) score += 20;
  if (tags.includes("sponsors-visa") || tags.includes("no-sponsorship")) score += 15;
  if (raw.locations.length > 0 || raw.isRemote) score += 10;
  if (raw.descriptionText.length >= 300) score += 10;
  const posted = raw.postedAt ?? now;
  if (now.getTime() - posted.getTime() <= WEEK_MS) score += 15;
  return score;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: all rules tests PASS (normalize tests still green).

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm -F @interbase/scraper typecheck
git add -A && git commit -m "feat: entry-level filter, tag extraction, quality scoring"
```

---

### Task 5: Greenhouse adapter

**Files:**
- Create: `packages/scraper/src/adapters/greenhouse.ts`, `packages/scraper/src/tests/helpers.ts`, `packages/scraper/src/tests/fixtures/greenhouse.json`
- Test: `packages/scraper/src/adapters/greenhouse.test.ts`

**Interfaces:**
- Consumes: `htmlToText` from `../normalize`; `rawListingSchema`, `RawListing`, `SeedCompany` from `../types`.
- Produces: `fetchGreenhouse(company: SeedCompany, fetchFn?: typeof fetch): Promise<RawListing[]>`. Throws on non-OK HTTP or shape mismatch (callers isolate errors). Maps ALL jobs — entry-level filtering happens later in persist, not in adapters.
- Also produces the shared test helper `stubFetch(body: unknown, status?: number): typeof fetch`.

- [ ] **Step 1: Create the shared test helper**

`packages/scraper/src/tests/helpers.ts`:

```ts
export function stubFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}
```

- [ ] **Step 2: Create the fixture**

`packages/scraper/src/tests/fixtures/greenhouse.json`:

```json
{
  "jobs": [
    {
      "id": 4011001,
      "title": "Software Engineering Intern, Summer 2027",
      "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4011001?gh_src=feed",
      "updated_at": "2026-07-14T09:00:00-04:00",
      "location": { "name": "San Francisco, CA" },
      "content": "&lt;p&gt;Join us! Pay: $50/hour. We sponsor visas.&lt;/p&gt;"
    },
    {
      "id": 4011002,
      "title": "Senior Software Engineer, Payments",
      "absolute_url": "https://boards.greenhouse.io/stripe/jobs/4011002",
      "updated_at": "2026-07-13T09:00:00-04:00",
      "location": { "name": "Remote, US" },
      "content": "&lt;p&gt;Lead our payments team.&lt;/p&gt;"
    }
  ]
}
```

- [ ] **Step 3: Write the failing test**

`packages/scraper/src/adapters/greenhouse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchGreenhouse } from "./greenhouse";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/greenhouse.json";

const company = { name: "Stripe", slug: "stripe", atsType: "greenhouse" as const, atsToken: "stripe" };

describe("fetchGreenhouse", () => {
  it("maps jobs to RawListing (no entry-level filtering here)", async () => {
    const raws = await fetchGreenhouse(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    const first = raws[0]!;
    expect(first).toMatchObject({
      source: "greenhouse",
      externalId: "4011001",
      companyName: "Stripe",
      companySlug: "stripe",
      title: "Software Engineering Intern, Summer 2027",
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/4011001?gh_src=feed",
      locations: ["San Francisco, CA"],
      isRemote: false,
    });
    expect(first.descriptionText).toBe("Join us! Pay: $50/hour. We sponsor visas.");
    expect(first.postedAt).toEqual(new Date("2026-07-14T09:00:00-04:00"));
    expect(raws[1]!.isRemote).toBe(true);
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchGreenhouse(company, stubFetch({}, 404))).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./greenhouse` not found.

- [ ] **Step 5: Implement packages/scraper/src/adapters/greenhouse.ts**

```ts
import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const ghResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string().url(),
      updated_at: z.string().nullish(),
      location: z.object({ name: z.string() }).nullish(),
      content: z.string().nullish(),
    }),
  ),
});

export async function fetchGreenhouse(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(
    `https://boards-api.greenhouse.io/v1/boards/${company.atsToken}/jobs?content=true`,
  );
  if (!res.ok) throw new Error(`greenhouse ${company.slug}: HTTP ${res.status}`);
  const data = ghResponse.parse(await res.json());
  return data.jobs.map((j) =>
    rawListingSchema.parse({
      source: "greenhouse",
      externalId: String(j.id),
      companyName: company.name,
      companySlug: company.slug,
      title: j.title,
      applyUrl: j.absolute_url,
      locations: j.location?.name ? [j.location.name] : [],
      isRemote: /remote/i.test(j.location?.name ?? ""),
      descriptionText: htmlToText(j.content ?? ""),
      hasCompensationData: false,
      postedAt: j.updated_at ? new Date(j.updated_at) : null,
    }),
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: greenhouse adapter"
```

---

### Task 6: Lever adapter

**Files:**
- Create: `packages/scraper/src/adapters/lever.ts`, `packages/scraper/src/tests/fixtures/lever.json`
- Test: `packages/scraper/src/adapters/lever.test.ts`

**Interfaces:**
- Consumes: `htmlToText` from `../normalize`; `rawListingSchema`, `RawListing`, `SeedCompany` from `../types`; `stubFetch` from `../tests/helpers` (defined in Task 5).
- Produces: `fetchLever(company: SeedCompany, fetchFn?: typeof fetch): Promise<RawListing[]>`.

- [ ] **Step 1: Create the fixture**

`packages/scraper/src/tests/fixtures/lever.json`:

```json
[
  {
    "id": "a1b2c3",
    "text": "Backend Engineering Intern (Summer 2027)",
    "hostedUrl": "https://jobs.lever.co/plaid/a1b2c3?lever-source=feed",
    "createdAt": 1784100000000,
    "categories": { "location": "New York, NY", "commitment": "Intern" },
    "workplaceType": "hybrid",
    "descriptionPlain": "Work on our data pipelines. Hourly stipend provided.",
    "salaryRange": { "min": 40, "max": 55, "currency": "USD", "interval": "per-hour-wage" }
  },
  {
    "id": "d4e5f6",
    "text": "Machine Learning Engineer, New Grad",
    "hostedUrl": "https://jobs.lever.co/plaid/d4e5f6",
    "createdAt": 1784000000000,
    "categories": { "location": "Remote - US" },
    "workplaceType": "remote",
    "descriptionPlain": "Entry-level ML role."
  }
]
```

- [ ] **Step 2: Write the failing test**

`packages/scraper/src/adapters/lever.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchLever } from "./lever";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/lever.json";

const company = { name: "Plaid", slug: "plaid", atsType: "lever" as const, atsToken: "plaid" };

describe("fetchLever", () => {
  it("maps postings to RawListing", async () => {
    const raws = await fetchLever(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    expect(raws[0]).toMatchObject({
      source: "lever",
      externalId: "a1b2c3",
      companySlug: "plaid",
      title: "Backend Engineering Intern (Summer 2027)",
      applyUrl: "https://jobs.lever.co/plaid/a1b2c3?lever-source=feed",
      locations: ["New York, NY"],
      isRemote: false,
      hasCompensationData: true,
      descriptionText: "Work on our data pipelines. Hourly stipend provided.",
    });
    expect(raws[0]!.postedAt).toEqual(new Date(1784100000000));
    expect(raws[1]).toMatchObject({ isRemote: true, hasCompensationData: false });
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchLever(company, stubFetch([], 500))).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./lever` not found.

- [ ] **Step 4: Implement packages/scraper/src/adapters/lever.ts**

```ts
import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const leverResponse = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().url(),
    createdAt: z.number().nullish(),
    categories: z.object({ location: z.string().nullish() }).nullish(),
    workplaceType: z.string().nullish(),
    descriptionPlain: z.string().nullish(),
    description: z.string().nullish(),
    salaryRange: z.object({}).passthrough().nullish(),
  }),
);

export async function fetchLever(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(`https://api.lever.co/v0/postings/${company.atsToken}?mode=json`);
  if (!res.ok) throw new Error(`lever ${company.slug}: HTTP ${res.status}`);
  const postings = leverResponse.parse(await res.json());
  return postings.map((p) => {
    const location = p.categories?.location ?? "";
    return rawListingSchema.parse({
      source: "lever",
      externalId: p.id,
      companyName: company.name,
      companySlug: company.slug,
      title: p.text,
      applyUrl: p.hostedUrl,
      locations: location ? [location] : [],
      isRemote: p.workplaceType === "remote" || /remote/i.test(location),
      descriptionText: p.descriptionPlain ?? htmlToText(p.description ?? ""),
      hasCompensationData: p.salaryRange != null,
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
    });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: lever adapter"
```

---

### Task 7: Ashby adapter

**Files:**
- Create: `packages/scraper/src/adapters/ashby.ts`, `packages/scraper/src/tests/fixtures/ashby.json`
- Test: `packages/scraper/src/adapters/ashby.test.ts`

**Interfaces:**
- Consumes: `htmlToText` from `../normalize`; `rawListingSchema`, `RawListing`, `SeedCompany` from `../types`; `stubFetch` from `../tests/helpers`.
- Produces: `fetchAshby(company: SeedCompany, fetchFn?: typeof fetch): Promise<RawListing[]>`.

- [ ] **Step 1: Create the fixture**

`packages/scraper/src/tests/fixtures/ashby.json`:

```json
{
  "jobs": [
    {
      "id": "9f1c2e34-0000-4000-8000-000000000001",
      "title": "Software Engineer Intern (Summer 2027)",
      "location": "New York",
      "secondaryLocations": [{ "location": "San Francisco" }],
      "isRemote": false,
      "publishedAt": "2026-07-14T13:00:00.000Z",
      "jobUrl": "https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000001",
      "applyUrl": "https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000001/application",
      "descriptionHtml": "<p>Build internal tools. Open to freshman and sophomore students.</p>",
      "compensation": { "compensationTierSummary": "$50–$60 / hr" }
    },
    {
      "id": "9f1c2e34-0000-4000-8000-000000000002",
      "title": "Staff Product Designer",
      "location": "Remote",
      "isRemote": true,
      "publishedAt": "2026-07-10T13:00:00.000Z",
      "jobUrl": "https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000002",
      "descriptionHtml": "<p>Lead design.</p>"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`packages/scraper/src/adapters/ashby.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchAshby } from "./ashby";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/ashby.json";

const company = { name: "Ramp", slug: "ramp", atsType: "ashby" as const, atsToken: "ramp" };

describe("fetchAshby", () => {
  it("maps jobs to RawListing with merged locations", async () => {
    const raws = await fetchAshby(company, stubFetch(fixture));
    expect(raws).toHaveLength(2);
    expect(raws[0]).toMatchObject({
      source: "ashby",
      externalId: "9f1c2e34-0000-4000-8000-000000000001",
      title: "Software Engineer Intern (Summer 2027)",
      applyUrl: "https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000001/application",
      locations: ["New York", "San Francisco"],
      isRemote: false,
      hasCompensationData: true,
    });
    expect(raws[0]!.descriptionText).toBe("Build internal tools. Open to freshman and sophomore students.");
    expect(raws[1]).toMatchObject({ isRemote: true, hasCompensationData: false });
    // falls back to jobUrl when applyUrl missing
    expect(raws[1]!.applyUrl).toBe("https://jobs.ashbyhq.com/ramp/9f1c2e34-0000-4000-8000-000000000002");
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchAshby(company, stubFetch({}, 403))).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./ashby` not found.

- [ ] **Step 4: Implement packages/scraper/src/adapters/ashby.ts**

```ts
import { z } from "zod";
import { htmlToText } from "../normalize";
import { rawListingSchema, type RawListing, type SeedCompany } from "../types";

const ashbyResponse = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.object({ location: z.string() })).nullish(),
      isRemote: z.boolean().nullish(),
      publishedAt: z.string().nullish(),
      jobUrl: z.string().url(),
      applyUrl: z.string().url().nullish(),
      descriptionHtml: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      compensation: z.object({}).passthrough().nullish(),
    }),
  ),
});

export async function fetchAshby(
  company: SeedCompany,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(
    `https://api.ashbyhq.com/posting-api/job-board/${company.atsToken}?includeCompensation=true`,
  );
  if (!res.ok) throw new Error(`ashby ${company.slug}: HTTP ${res.status}`);
  const data = ashbyResponse.parse(await res.json());
  return data.jobs.map((j) => {
    const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
      .filter((l): l is string => !!l);
    return rawListingSchema.parse({
      source: "ashby",
      externalId: j.id,
      companyName: company.name,
      companySlug: company.slug,
      title: j.title,
      applyUrl: j.applyUrl ?? j.jobUrl,
      locations,
      isRemote: j.isRemote ?? locations.some((l) => /remote/i.test(l)),
      descriptionText: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
      hasCompensationData: j.compensation != null,
      postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: ashby adapter"
```

---

### Task 8: SimplifyJobs GitHub-list adapter

**Files:**
- Create: `packages/scraper/src/adapters/simplify.ts`, `packages/scraper/src/tests/fixtures/simplify.json`
- Test: `packages/scraper/src/adapters/simplify.test.ts`

**Interfaces:**
- Consumes: `slugify` from `../normalize`; `rawListingSchema`, `RawListing` from `../types`; `stubFetch` from `../tests/helpers`.
- Produces: `fetchSimplify(repo: string, fetchFn?: typeof fetch): Promise<RawListing[]>` — fetches `https://raw.githubusercontent.com/${repo}/dev/.github/scripts/listings.json` (the SimplifyJobs repos keep the JSON on the `dev` branch). Skips entries that are `active: false` or `is_visible: false`. Maps `sponsorship` text → structured field, `terms[0]` → `season`.

- [ ] **Step 1: Create the fixture**

`packages/scraper/src/tests/fixtures/simplify.json`:

```json
[
  {
    "id": "sim-0001",
    "source": "Simplify",
    "company_name": "Chime",
    "title": "Software Engineer Intern",
    "locations": ["San Francisco, CA"],
    "terms": ["Summer 2027"],
    "sponsorship": "Offers Sponsorship",
    "active": true,
    "is_visible": true,
    "url": "https://boards.greenhouse.io/chime/jobs/999?utm_source=Simplify",
    "date_posted": 1784100000
  },
  {
    "id": "sim-0002",
    "source": "Simplify",
    "company_name": "Vanta",
    "title": "Security Engineer Intern",
    "locations": ["Remote in USA"],
    "terms": ["Summer 2027"],
    "sponsorship": "Does Not Offer Sponsorship",
    "active": true,
    "is_visible": true,
    "url": "https://jobs.lever.co/vanta/abc123",
    "date_posted": 1784000000
  },
  {
    "id": "sim-0003",
    "source": "Simplify",
    "company_name": "DeadCo",
    "title": "SWE Intern",
    "locations": [],
    "terms": [],
    "sponsorship": "Other",
    "active": false,
    "is_visible": true,
    "url": "https://example.com/gone",
    "date_posted": 1780000000
  }
]
```

- [ ] **Step 2: Write the failing test**

`packages/scraper/src/adapters/simplify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchSimplify } from "./simplify";
import { stubFetch } from "../tests/helpers";
import fixture from "../tests/fixtures/simplify.json";

describe("fetchSimplify", () => {
  it("maps active+visible entries, structured sponsorship, season from terms", async () => {
    const raws = await fetchSimplify("SimplifyJobs/Summer2027-Internships", stubFetch(fixture));
    expect(raws).toHaveLength(2); // inactive entry skipped
    expect(raws[0]).toMatchObject({
      source: "github_list",
      externalId: "sim-0001",
      companyName: "Chime",
      companySlug: "chime",
      sponsorship: "yes",
      season: "Summer 2027",
      locations: ["San Francisco, CA"],
      isRemote: false,
    });
    expect(raws[0]!.postedAt).toEqual(new Date(1784100000 * 1000));
    expect(raws[1]).toMatchObject({ sponsorship: "no", isRemote: true });
  });

  it("throws on non-OK responses", async () => {
    await expect(fetchSimplify("SimplifyJobs/Nope", stubFetch([], 404))).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./simplify` not found.

- [ ] **Step 4: Implement packages/scraper/src/adapters/simplify.ts**

```ts
import { z } from "zod";
import { slugify } from "../normalize";
import { rawListingSchema, type RawListing } from "../types";

const simplifyResponse = z.array(
  z.object({
    id: z.string(),
    company_name: z.string(),
    title: z.string(),
    locations: z.array(z.string()).default([]),
    terms: z.array(z.string()).default([]),
    sponsorship: z.string().nullish(),
    active: z.boolean().default(true),
    is_visible: z.boolean().default(true),
    url: z.string().url(),
    date_posted: z.number().nullish(),
  }),
);

function mapSponsorship(s: string | null | undefined): "yes" | "no" | null {
  if (s === "Offers Sponsorship") return "yes";
  if (s === "Does Not Offer Sponsorship" || s === "U.S. Citizenship is Required") return "no";
  return null;
}

export async function fetchSimplify(
  repo: string,
  fetchFn: typeof fetch = fetch,
): Promise<RawListing[]> {
  const res = await fetchFn(`https://raw.githubusercontent.com/${repo}/dev/.github/scripts/listings.json`);
  if (!res.ok) throw new Error(`simplify ${repo}: HTTP ${res.status}`);
  const entries = simplifyResponse.parse(await res.json());
  return entries
    .filter((e) => e.active && e.is_visible)
    .map((e) =>
      rawListingSchema.parse({
        source: "github_list",
        externalId: e.id,
        companyName: e.company_name,
        companySlug: slugify(e.company_name),
        title: e.title,
        applyUrl: e.url,
        locations: e.locations,
        isRemote: e.locations.some((l) => /remote/i.test(l)),
        descriptionText: "",
        hasCompensationData: false,
        sponsorship: mapSponsorship(e.sponsorship),
        season: e.terms[0] ?? null,
        postedAt: e.date_posted ? new Date(e.date_posted * 1000) : null,
      }),
    );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: simplify github-list adapter"
```

---

### Task 9: Persistence — upsert, cross-source dedupe, expiry

**Files:**
- Create: `packages/scraper/src/persist.ts`
- Test: `packages/scraper/src/persist.test.ts`

**Interfaces:**
- Consumes: `companies`, `listings`, `Db` from `@interbase/db`; `createTestDb` from `@interbase/db/testing`; normalize + rules + types from Tasks 3–4.
- Produces (exact, used by run.ts and digest):
  - `upsertCompanies(db: Db, seed: SeedCompany[]): Promise<Map<string, number>>` — slug → id.
  - `upsertListings(db: Db, raws: RawListing[], opts: { knownSlugs: Set<string>; now?: Date }): Promise<{ kept: number; skipped: number }>` — applies `isEntryLevel` (skips failures), computes tags/score/season/titleNorm/urlCanon/snippet, upserts on `(source, externalId)`, auto-creates companies for unknown `github_list` slugs. `postedAt`/`firstSeenAt` are set on insert only; updates refresh `lastSeenAt`, content fields, and set `isActive: true`.
  - `crossSourceDedupe(db: Db): Promise<number>` — deactivates active `github_list` rows that duplicate an active ATS-sourced row for the same company (same `titleNorm` OR same `urlCanon`).
  - `expireListings(db: Db, now?: Date): Promise<number>` — deactivates rows with `lastSeenAt` > 5 days old OR `postedAt` > 60 days old.

- [ ] **Step 1: Write the failing tests**

`packages/scraper/src/persist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings } from "@interbase/db";
import { crossSourceDedupe, expireListings, upsertCompanies, upsertListings } from "./persist";
import { rawListingSchema, type RawListing } from "./types";

const SEED = [{ name: "Stripe", slug: "stripe", atsType: "greenhouse" as const, atsToken: "stripe" }];

function raw(overrides: Partial<RawListing> = {}): RawListing {
  return rawListingSchema.parse({
    source: "greenhouse", externalId: "gh-1", companyName: "Stripe", companySlug: "stripe",
    title: "Software Engineering Intern, Summer 2027",
    applyUrl: "https://boards.greenhouse.io/stripe/jobs/1?gh_src=x",
    descriptionText: "Pay: $50/hour. We sponsor visas.",
    postedAt: new Date("2026-07-14T00:00:00Z"),
    ...overrides,
  });
}

describe("upsertListings", () => {
  it("inserts entry-level listings with computed fields, skips senior roles", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const now = new Date("2026-07-15T00:00:00Z");
    const result = await upsertListings(
      db,
      [raw(), raw({ externalId: "gh-2", title: "Senior Software Engineer" })],
      { knownSlugs: new Set(["stripe"]), now },
    );
    expect(result).toEqual({ kept: 1, skipped: 1 });
    const [row] = await db.select().from(listings);
    expect(row).toMatchObject({
      season: "Summer 2027",
      urlCanon: "https://boards.greenhouse.io/stripe/jobs/1",
      titleNorm: "software engineering intern",
      isActive: true,
    });
    expect(row!.tags).toEqual(expect.arrayContaining(["paid", "sponsors-visa"]));
    // rubric for this fixture: known 30 + paid 20 + sponsorship clarity 15 + no location 0 + short desc 0 + fresh 15
    expect(row!.qualityScore).toBe(80);
  });

  it("re-upsert updates lastSeenAt without duplicating, preserves postedAt", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const t1 = new Date("2026-07-14T00:00:00Z");
    const t2 = new Date("2026-07-15T00:00:00Z");
    await upsertListings(db, [raw()], { knownSlugs: new Set(["stripe"]), now: t1 });
    await upsertListings(db, [raw()], { knownSlugs: new Set(["stripe"]), now: t2 });
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeenAt).toEqual(t2);
    expect(rows[0]!.firstSeenAt).toEqual(t1);
  });

  it("auto-creates companies for unknown github_list slugs", async () => {
    const db = await createTestDb();
    await upsertListings(
      db,
      [raw({ source: "github_list", externalId: "sim-9", companyName: "Vanta", companySlug: "vanta" })],
      { knownSlugs: new Set() },
    );
    const co = await db.select().from(companies).where(eq(companies.slug, "vanta"));
    expect(co).toHaveLength(1);
    expect(co[0]!.atsType).toBe("github_list");
  });
});

describe("crossSourceDedupe", () => {
  it("deactivates github_list duplicates of ATS rows (same company + titleNorm)", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    await upsertListings(
      db,
      [
        raw(), // greenhouse
        raw({ source: "github_list", externalId: "sim-1", applyUrl: "https://simplify.jobs/x", title: "Software Engineering Intern (Summer 2027)" }),
      ],
      { knownSlugs: new Set(["stripe"]) },
    );
    const n = await crossSourceDedupe(db);
    expect(n).toBe(1);
    const rows = await db.select().from(listings).where(eq(listings.isActive, true));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("greenhouse");
  });
});

describe("expireListings", () => {
  it("deactivates stale-seen and old-posted listings", async () => {
    const db = await createTestDb();
    await upsertCompanies(db, SEED);
    const now = new Date("2026-07-15T00:00:00Z");
    await upsertListings(
      db,
      [
        raw({ externalId: "fresh" }),
        raw({ externalId: "old-posted", postedAt: new Date("2026-05-01T00:00:00Z") }),
      ],
      { knownSlugs: new Set(["stripe"]), now },
    );
    // simulate a listing not seen for 6 days
    await db.update(listings).set({ lastSeenAt: new Date("2026-07-09T00:00:00Z") })
      .where(eq(listings.externalId, "fresh"));
    const n = await expireListings(db, now);
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./persist` not found.

- [ ] **Step 3: Implement packages/scraper/src/persist.ts**

```ts
import { and, eq, lt, or, sql } from "drizzle-orm";
import { companies, listings, type Db } from "@interbase/db";
import { canonicalUrl, logoColor, normalizeTitle, parseSeason, snippet } from "./normalize";
import { extractTags, isEntryLevel, scoreListing } from "./rules";
import { rawListingSchema, type RawListing, type SeedCompany } from "./types";

export async function upsertCompanies(db: Db, seed: SeedCompany[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const c of seed) {
    const [row] = await db
      .insert(companies)
      .values({
        name: c.name, slug: c.slug, website: c.website,
        atsType: c.atsType, atsToken: c.atsToken, logoColor: logoColor(c.name),
      })
      .onConflictDoUpdate({
        target: companies.slug,
        set: { name: c.name, atsType: c.atsType, atsToken: c.atsToken },
      })
      .returning({ id: companies.id });
    map.set(c.slug, row!.id);
  }
  return map;
}

async function ensureCompany(db: Db, raw: RawListing): Promise<number> {
  const existing = await db.select({ id: companies.id }).from(companies)
    .where(eq(companies.slug, raw.companySlug));
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(companies)
    .values({
      name: raw.companyName, slug: raw.companySlug,
      atsType: "github_list", logoColor: logoColor(raw.companyName),
    })
    .onConflictDoNothing({ target: companies.slug })
    .returning({ id: companies.id });
  if (inserted[0]) return inserted[0].id;
  const again = await db.select({ id: companies.id }).from(companies)
    .where(eq(companies.slug, raw.companySlug));
  return again[0]!.id;
}

export async function upsertListings(
  db: Db,
  raws: RawListing[],
  opts: { knownSlugs: Set<string>; now?: Date },
): Promise<{ kept: number; skipped: number }> {
  const now = opts.now ?? new Date();
  let kept = 0;
  let skipped = 0;
  const companyIds = new Map<string, number>();
  for (const candidate of raws) {
    const parsed = rawListingSchema.safeParse(candidate);
    if (!parsed.success || !isEntryLevel(parsed.data.title)) {
      skipped++;
      continue;
    }
    const raw = parsed.data;
    let companyId = companyIds.get(raw.companySlug);
    if (companyId == null) {
      companyId = await ensureCompany(db, raw);
      companyIds.set(raw.companySlug, companyId);
    }
    const tags = extractTags(raw);
    const content = {
      companyName: raw.companyName,
      title: raw.title,
      titleNorm: normalizeTitle(raw.title),
      applyUrl: raw.applyUrl,
      urlCanon: canonicalUrl(raw.applyUrl),
      descriptionSnippet: snippet(raw.descriptionText),
      locations: raw.locations,
      isRemote: raw.isRemote,
      season: raw.season ?? parseSeason(raw.title),
      tags,
      qualityScore: scoreListing({ raw, tags, isKnownCompany: opts.knownSlugs.has(raw.companySlug), now }),
    };
    await db.insert(listings)
      .values({
        ...content, companyId, source: raw.source, externalId: raw.externalId,
        postedAt: raw.postedAt ?? now, firstSeenAt: now, lastSeenAt: now, isActive: true,
      })
      .onConflictDoUpdate({
        target: [listings.source, listings.externalId],
        set: { ...content, lastSeenAt: now, isActive: true },
      });
    kept++;
  }
  return { kept, skipped };
}

export async function crossSourceDedupe(db: Db): Promise<number> {
  const res = (await db.execute(sql`
    update listings g
    set is_active = false
    from listings a
    where g.source = 'github_list'
      and a.source <> 'github_list'
      and g.company_id = a.company_id
      and g.is_active and a.is_active
      and (g.title_norm = a.title_norm or g.url_canon = a.url_canon)
    returning g.id
  `)) as unknown as { rows: unknown[] };
  return res.rows.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function expireListings(db: Db, now = new Date()): Promise<number> {
  const staleSeen = new Date(now.getTime() - 5 * DAY_MS);
  const stalePosted = new Date(now.getTime() - 60 * DAY_MS);
  const rows = await db.update(listings)
    .set({ isActive: false })
    .where(and(
      eq(listings.isActive, true),
      or(lt(listings.lastSeenAt, staleSeen), lt(listings.postedAt, stalePosted)),
    ))
    .returning({ id: listings.id });
  return rows.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS. If `db.execute(...).rows` misbehaves on PGlite, log the raw result shape and adapt the cast — both neon-http and pglite drivers return `{ rows: [...] }`.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm -F @interbase/scraper typecheck
git add -A && git commit -m "feat: listing persistence with dedupe and expiry"
```

---

### Task 10: Company seed list + scrape orchestrator + CLI

**Files:**
- Create: `packages/scraper/companies.seed.json`, `packages/scraper/src/run.ts`, `packages/scraper/src/cli.ts`
- Test: `packages/scraper/src/run.test.ts`

**Interfaces:**
- Consumes: all four adapters, persist functions, `seedCompanySchema`/`SeedCompany` from types, `createDb`/`Db` from `@interbase/db`.
- Produces:
  - `loadSeed(): SeedCompany[]`
  - `runScrape(db: Db, opts?: { seed?: SeedCompany[]; simplifyRepo?: string; fetchFn?: typeof fetch; now?: Date }): Promise<RunSummary>` with `RunSummary = { fetched: number; kept: number; skipped: number; deduped: number; expired: number; errors: string[] }`
  - CLI: `pnpm -F @interbase/scraper scrape` (reads `DATABASE_URL`, `SIMPLIFY_REPO`).

- [ ] **Step 1: Create packages/scraper/companies.seed.json**

```json
[
  { "name": "Stripe", "slug": "stripe", "website": "https://stripe.com", "atsType": "greenhouse", "atsToken": "stripe" },
  { "name": "Databricks", "slug": "databricks", "website": "https://databricks.com", "atsType": "greenhouse", "atsToken": "databricks" },
  { "name": "Figma", "slug": "figma", "website": "https://figma.com", "atsType": "greenhouse", "atsToken": "figma" },
  { "name": "Duolingo", "slug": "duolingo", "website": "https://duolingo.com", "atsType": "greenhouse", "atsToken": "duolingo" },
  { "name": "Robinhood", "slug": "robinhood", "website": "https://robinhood.com", "atsType": "greenhouse", "atsToken": "robinhood" },
  { "name": "Datadog", "slug": "datadog", "website": "https://datadoghq.com", "atsType": "greenhouse", "atsToken": "datadog" },
  { "name": "Cloudflare", "slug": "cloudflare", "website": "https://cloudflare.com", "atsType": "greenhouse", "atsToken": "cloudflare" },
  { "name": "Plaid", "slug": "plaid", "website": "https://plaid.com", "atsType": "lever", "atsToken": "plaid" },
  { "name": "Palantir", "slug": "palantir", "website": "https://palantir.com", "atsType": "lever", "atsToken": "palantir" },
  { "name": "Notion", "slug": "notion", "website": "https://notion.so", "atsType": "ashby", "atsToken": "notion" },
  { "name": "Linear", "slug": "linear", "website": "https://linear.app", "atsType": "ashby", "atsToken": "linear" },
  { "name": "Ramp", "slug": "ramp", "website": "https://ramp.com", "atsType": "ashby", "atsToken": "ramp" }
]
```

- [ ] **Step 2: Verify the seed tokens against the live APIs**

These tokens are educated guesses; verify each and fix/remove any that fail (this is the ONLY step in the plan that touches the live network — it validates data, not code):

```bash
for t in stripe databricks figma duolingo robinhood datadog cloudflare; do
  echo "greenhouse/$t: $(curl -s -o /dev/null -w '%{http_code}' https://boards-api.greenhouse.io/v1/boards/$t/jobs)"
done
for t in plaid palantir; do
  echo "lever/$t: $(curl -s -o /dev/null -w '%{http_code}' https://api.lever.co/v0/postings/$t?mode=json)"
done
for t in notion linear ramp; do
  echo "ashby/$t: $(curl -s -o /dev/null -w '%{http_code}' "https://api.ashbyhq.com/posting-api/job-board/$t")"
done
```

Expected: `200` for every line. For any non-200: find the company's real careers URL, extract the correct token from it (greenhouse: `boards.greenhouse.io/<token>`, lever: `jobs.lever.co/<token>`, ashby: `jobs.ashbyhq.com/<token>`), or move the company to the correct `atsType`, or delete the entry. Do not commit entries that don't return 200.

- [ ] **Step 3: Write the failing test**

`packages/scraper/src/run.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { listings } from "@interbase/db";
import { runScrape } from "./run";

const seed = [
  { name: "GoodCo", slug: "goodco", atsType: "greenhouse" as const, atsToken: "goodco" },
  { name: "BadCo", slug: "badco", atsType: "greenhouse" as const, atsToken: "badco" },
];

const ghBody = {
  jobs: [{
    id: 1, title: "Software Engineering Intern", absolute_url: "https://boards.greenhouse.io/goodco/jobs/1",
    updated_at: "2026-07-14T00:00:00Z", location: { name: "NYC" }, content: "great team",
  }],
};

const fetchFn = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("goodco")) return new Response(JSON.stringify(ghBody), { status: 200 });
  if (url.includes("badco")) return new Response("{}", { status: 500 });
  return new Response("[]", { status: 200 }); // simplify list
}) as unknown as typeof fetch;

describe("runScrape", () => {
  it("isolates per-source failures and publishes what succeeded", async () => {
    const db = await createTestDb();
    const summary = await runScrape(db, { seed, fetchFn, simplifyRepo: "x/y" });
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatch(/badco/);
    expect(summary.kept).toBe(1);
    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./run` not found.

- [ ] **Step 5: Implement packages/scraper/src/run.ts**

```ts
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
  const repo = opts.simplifyRepo ?? process.env.SIMPLIFY_REPO ?? "SimplifyJobs/Summer2027-Internships";
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
```

- [ ] **Step 6: Implement packages/scraper/src/cli.ts**

```ts
import { createDb } from "@interbase/db";
import { runScrape } from "./run";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const summary = await runScrape(createDb(url));
console.log(JSON.stringify(summary, null, 2));
if (summary.errors.length > 0) console.error(`warning: ${summary.errors.length} source(s) failed`);
process.exit(summary.kept === 0 && summary.errors.length > 0 ? 1 : 0);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test`
Expected: PASS (all scraper tests green).

- [ ] **Step 8: Verify CLI wiring**

Run: `DATABASE_URL="" pnpm -F @interbase/scraper scrape; echo "exit=$?"`
Expected: prints `DATABASE_URL is required`, `exit=1`. (A full live smoke-run against local PGlite happens in Task 13 once `seed:dev` exists to create/migrate the local database — `drizzle-kit migrate` itself can't talk to PGlite.)

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: scrape orchestrator, company seed list, CLI"
```

---

### Task 11: GitHub Actions scrape workflow

**Files:**
- Create: `.github/workflows/scrape.yml`

**Interfaces:**
- Consumes: `pnpm -F @interbase/db migrate`, `pnpm -F @interbase/scraper scrape` (Task 10), `pnpm -F @interbase/scraper digest` (Task 21 — the step will fail if the workflow is manually triggered before Task 21 lands; that's fine pre-launch).
- Produces: twice-daily cron (11:00 & 23:00 UTC ≈ 07:00/19:00 ET) + manual `workflow_dispatch`. Secrets (`DATABASE_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, `BASE_URL`) are configured in Task 23.

- [ ] **Step 1: Create .github/workflows/scrape.yml**

```yaml
name: scrape
on:
  schedule:
    - cron: "0 11 * * *"
    - cron: "0 23 * * *"
  workflow_dispatch: {}
concurrency:
  group: scrape
  cancel-in-progress: false
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Migrate database
        run: pnpm -F @interbase/db migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Scrape
        run: pnpm -F @interbase/scraper scrape
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SIMPLIFY_REPO: SimplifyJobs/Summer2027-Internships
      - name: Send digests
        run: pnpm -F @interbase/scraper digest
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          FROM_EMAIL: ${{ secrets.FROM_EMAIL }}
          BASE_URL: ${{ secrets.BASE_URL }}
```

- [ ] **Step 2: Validate the YAML parses**

Run: `pnpm dlx js-yaml .github/workflows/scrape.yml > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: twice-daily scrape workflow"
```

---

### Task 12: Next.js scaffold with Paper design tokens

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/lib/db.ts`

**Interfaces:**
- Consumes: `createDb`, `Db` from `@interbase/db`.
- Produces: running Next.js app; Tailwind classes backed by Paper tokens (`bg-bg`, `bg-surface`, `border-border`, `text-ink`, `text-muted`, `bg-accent`, `bg-accent-soft`, `border-accent-border`, `text-ok`, `bg-ok-soft`); `getDb(): Db` and `setDb(db: Db): void` from `@/lib/db` (setDb exists for tests).

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@interbase/db": "workspace:*",
    "next": "15.1.6",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

(`e2e` script becomes functional in Task 21.)

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@interbase/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/postcss.config.mjs**

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 5: Create apps/web/vitest.config.ts**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

(The `@` alias mirrors tsconfig `paths` — vitest doesn't read tsconfig paths on its own.)

- [ ] **Step 6: Create apps/web/src/app/globals.css (Paper tokens)**

```css
@import "tailwindcss";

@theme {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e7e8ea;
  --color-ink: #17181a;
  --color-muted: #8b8f96;
  --color-accent: #4f46e5;
  --color-accent-soft: #eef0fe;
  --color-accent-border: #c9cdf7;
  --color-ok: #189a4e;
  --color-ok-soft: #e9f8ef;
  --font-sans: -apple-system, "Segoe UI", "Inter", sans-serif;
}

body {
  font-family: var(--font-sans);
}
```

- [ ] **Step 7: Create apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "interbase — entry-level CS internships, updated daily",
    template: "%s — interbase",
  },
  description:
    "The freshest entry-level software internships and new-grad-friendly roles, scraped daily from official company job boards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink antialiased">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="text-lg font-extrabold tracking-tight">
              inter<span className="text-accent">base</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Feed</Link>
              <Link href="/companies" className="hover:text-ink">Companies</Link>
              <Link href="/saved" className="hover:text-ink">Saved</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-border bg-surface py-8">
          <div className="mx-auto max-w-6xl px-4 text-sm text-muted">
            <p>interbase — entry-level CS internships, updated daily. Apply links go to official company job boards.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create apps/web/src/app/page.tsx (placeholder, replaced in Task 14)**

```tsx
export default function Home() {
  return <p className="text-muted">Feed coming soon.</p>;
}
```

- [ ] **Step 9: Create apps/web/src/lib/db.ts**

```ts
import { createDb, type Db } from "@interbase/db";

const g = globalThis as typeof globalThis & { __interbaseDb?: Db };

export function getDb(): Db {
  if (!g.__interbaseDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__interbaseDb = createDb(url);
  }
  return g.__interbaseDb;
}

export function setDb(db: Db): void {
  g.__interbaseDb = db;
}
```

- [ ] **Step 10: Verify the app builds**

Run: `pnpm install && pnpm -F web build`
Expected: "Compiled successfully", static `/` route. (`next-env.d.ts` is generated automatically.)

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: next.js app scaffold with paper design tokens"
```

---

### Task 13: Feed queries + local dev seed

**Files:**
- Create: `apps/web/src/lib/queries.ts`, `packages/db/src/seed-dev.ts`
- Test: `apps/web/src/lib/queries.test.ts`

**Interfaces:**
- Consumes: `companies`, `listings`, `Db` from `@interbase/db`; `createTestDb` from `@interbase/db/testing`.
- Produces (used by all pages):
  - `PAGE_SIZE = 50`
  - `interface FeedFilters { q?: string; location?: string; remote?: boolean; season?: string; visa?: boolean; frosh?: boolean; page?: number }`
  - `interface FeedListing { id: number; title: string; companyName: string; companySlug: string; logoColor: string; applyUrl: string; descriptionSnippet: string; locations: string[]; isRemote: boolean; season: string | null; tags: string[]; postedAt: Date; isActive: boolean }`
  - `getFeed(db: Db, f?: FeedFilters): Promise<FeedListing[]>` — active only, `postedAt desc, qualityScore desc`, limit `PAGE_SIZE * page`.
  - `getListingById(db: Db, id: number): Promise<FeedListing | null>` — includes inactive.
  - `getListingsByIds(db: Db, ids: number[]): Promise<FeedListing[]>` — includes inactive.
  - `getSeasons(db: Db): Promise<string[]>` — distinct non-null seasons of active listings, desc.
  - `interface CompanySummary { id: number; name: string; slug: string; website: string | null; logoColor: string; activeCount: number }`
  - `getCompaniesWithCounts(db: Db): Promise<CompanySummary[]>`
  - `getCompanyBySlug(db: Db, slug: string): Promise<{ company: typeof companies.$inferSelect; listings: FeedListing[] } | null>` — active listings, newest first.
  - Local dev DB convention (also used by e2e): run from repo root with `DATABASE_URL=pglite://$PWD/.data/dev` — absolute path, because each package script runs with its own cwd.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/queries.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings, type Db } from "@interbase/db";
import {
  getCompaniesWithCounts, getCompanyBySlug, getFeed, getListingById, getListingsByIds, getSeasons,
} from "./queries";

let db: Db;
let stripeId: number;

async function insertListing(overrides: Partial<typeof listings.$inferInsert> = {}) {
  const [row] = await db.insert(listings).values({
    companyId: stripeId, companyName: "Stripe", title: "Software Engineering Intern",
    titleNorm: "software engineering intern", applyUrl: "https://x.com/1", urlCanon: "https://x.com/1",
    source: "greenhouse", externalId: `e-${Math.random()}`, postedAt: new Date("2026-07-14T00:00:00Z"),
    ...overrides,
  }).returning();
  return row!;
}

beforeEach(async () => {
  db = await createTestDb();
  const [co] = await db.insert(companies).values({
    name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
  }).returning();
  stripeId = co!.id;
});

describe("getFeed", () => {
  it("returns active listings newest-first, quality breaks ties", async () => {
    const same = new Date("2026-07-14T00:00:00Z");
    await insertListing({ title: "B", postedAt: same, qualityScore: 10 });
    await insertListing({ title: "A", postedAt: same, qualityScore: 90 });
    await insertListing({ title: "Old inactive", isActive: false });
    const feed = await getFeed(db);
    expect(feed.map((l) => l.title)).toEqual(["A", "B"]);
  });

  it("full-text search matches title and company", async () => {
    await insertListing({ title: "Machine Learning Intern" });
    await insertListing({ title: "iOS Intern", companyName: "Figma" });
    expect((await getFeed(db, { q: "machine learning" })).map((l) => l.title)).toEqual(["Machine Learning Intern"]);
    expect(await getFeed(db, { q: "figma" })).toHaveLength(1);
  });

  it("filters: remote, season, visa, frosh, location", async () => {
    await insertListing({ title: "R", isRemote: true, season: "Summer 2027", tags: ["sponsors-visa"] });
    await insertListing({ title: "N", locations: ["New York, NY"], tags: ["freshman-ok"] });
    expect((await getFeed(db, { remote: true })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { season: "Summer 2027" })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { visa: true })).map((l) => l.title)).toEqual(["R"]);
    expect((await getFeed(db, { frosh: true })).map((l) => l.title)).toEqual(["N"]);
    expect((await getFeed(db, { location: "new york" })).map((l) => l.title)).toEqual(["N"]);
  });
});

describe("byId / byIds", () => {
  it("include inactive listings (for /saved and permalinks)", async () => {
    const row = await insertListing({ isActive: false });
    expect((await getListingById(db, row.id))?.isActive).toBe(false);
    expect(await getListingsByIds(db, [row.id, 999999])).toHaveLength(1);
    expect(await getListingsByIds(db, [])).toEqual([]);
  });
});

describe("companies + seasons", () => {
  it("counts active listings per company and lists seasons", async () => {
    await insertListing({ season: "Summer 2027" });
    await insertListing({ season: "Fall 2026", isActive: false });
    const cos = await getCompaniesWithCounts(db);
    expect(cos).toHaveLength(1);
    expect(cos[0]).toMatchObject({ slug: "stripe", activeCount: 1 });
    expect(await getSeasons(db)).toEqual(["Summer 2027"]);
    const page = await getCompanyBySlug(db, "stripe");
    expect(page?.listings).toHaveLength(1);
    expect(await getCompanyBySlug(db, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F web test`
Expected: FAIL — `./queries` not found.

- [ ] **Step 3: Implement apps/web/src/lib/queries.ts**

```ts
import {
  and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, or, sql,
} from "drizzle-orm";
import { companies, listings, type Db } from "@interbase/db";

export const PAGE_SIZE = 50;

export interface FeedFilters {
  q?: string; location?: string; remote?: boolean; season?: string;
  visa?: boolean; frosh?: boolean; page?: number;
}

export interface FeedListing {
  id: number; title: string; companyName: string; companySlug: string; logoColor: string;
  applyUrl: string; descriptionSnippet: string; locations: string[]; isRemote: boolean;
  season: string | null; tags: string[]; postedAt: Date; isActive: boolean;
}

const feedSelection = {
  id: listings.id, title: listings.title, companyName: listings.companyName,
  companySlug: companies.slug, logoColor: companies.logoColor,
  applyUrl: listings.applyUrl, descriptionSnippet: listings.descriptionSnippet,
  locations: listings.locations, isRemote: listings.isRemote, season: listings.season,
  tags: listings.tags, postedAt: listings.postedAt, isActive: listings.isActive,
};

export async function getFeed(db: Db, f: FeedFilters = {}): Promise<FeedListing[]> {
  const conds = [eq(listings.isActive, true)];
  if (f.q) {
    conds.push(or(
      sql`${listings.search} @@ websearch_to_tsquery('english', ${f.q})`,
      ilike(listings.title, `%${f.q}%`),
      ilike(listings.companyName, `%${f.q}%`),
    )!);
  }
  if (f.location) {
    conds.push(sql`exists (select 1 from unnest(${listings.locations}) as loc where loc ilike ${`%${f.location}%`})`);
  }
  if (f.remote) conds.push(eq(listings.isRemote, true));
  if (f.season) conds.push(eq(listings.season, f.season));
  if (f.visa) conds.push(arrayContains(listings.tags, ["sponsors-visa"]));
  if (f.frosh) conds.push(arrayContains(listings.tags, ["freshman-ok"]));
  return db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(and(...conds))
    .orderBy(desc(listings.postedAt), desc(listings.qualityScore))
    .limit(PAGE_SIZE * Math.max(1, f.page ?? 1));
}

export async function getListingById(db: Db, id: number): Promise<FeedListing | null> {
  const rows = await db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(eq(listings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getListingsByIds(db: Db, ids: number[]): Promise<FeedListing[]> {
  if (ids.length === 0) return [];
  return db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(inArray(listings.id, ids));
}

export async function getSeasons(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ season: listings.season }).from(listings)
    .where(and(eq(listings.isActive, true), isNotNull(listings.season)))
    .orderBy(desc(listings.season));
  return rows.map((r) => r.season!);
}

export interface CompanySummary {
  id: number; name: string; slug: string; website: string | null;
  logoColor: string; activeCount: number;
}

export async function getCompaniesWithCounts(db: Db): Promise<CompanySummary[]> {
  const rows = await db.select({
    id: companies.id, name: companies.name, slug: companies.slug,
    website: companies.website, logoColor: companies.logoColor,
    activeCount: count(listings.id),
  }).from(companies)
    .leftJoin(listings, and(eq(listings.companyId, companies.id), eq(listings.isActive, true)))
    .groupBy(companies.id)
    .orderBy(desc(count(listings.id)), companies.name);
  return rows.map((r) => ({ ...r, activeCount: Number(r.activeCount) }));
}

export async function getCompanyBySlug(
  db: Db, slug: string,
): Promise<{ company: typeof companies.$inferSelect; listings: FeedListing[] } | null> {
  const co = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1);
  if (!co[0]) return null;
  const rows = await db.select(feedSelection).from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(and(eq(listings.companyId, co[0].id), eq(listings.isActive, true)))
    .orderBy(desc(listings.postedAt));
  return { company: co[0], listings: rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F web test`
Expected: PASS.

- [ ] **Step 5: Create packages/db/src/seed-dev.ts**

```ts
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { companies, listings } from "./schema";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("pglite://")) {
  console.error("seed:dev only supports pglite:// DATABASE_URLs (never seed a real database)");
  process.exit(1);
}
const db = drizzle(new PGlite(url.slice("pglite://".length)), { schema });
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

await db.delete(listings);
await db.delete(companies);

const cos = await db.insert(companies).values([
  { name: "Stripe", slug: "stripe", website: "https://stripe.com", atsType: "greenhouse", atsToken: "stripe", logoColor: "#4f46e5" },
  { name: "Databricks", slug: "databricks", website: "https://databricks.com", atsType: "greenhouse", atsToken: "databricks", logoColor: "#be123c" },
  { name: "Ramp", slug: "ramp", website: "https://ramp.com", atsType: "ashby", atsToken: "ramp", logoColor: "#0369a1" },
]).returning();
const id = (slug: string) => cos.find((c) => c.slug === slug)!.id;

function listing(o: {
  co: string; title: string; ext: string; hours: number; locations?: string[];
  remote?: boolean; season?: string | null; tags?: string[]; score?: number; snippet?: string;
}) {
  return {
    companyId: id(o.co), companyName: cos.find((c) => c.slug === o.co)!.name,
    title: o.title, titleNorm: o.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    applyUrl: `https://jobs.example.com/${o.co}/${o.ext}`, urlCanon: `https://jobs.example.com/${o.co}/${o.ext}`,
    descriptionSnippet: o.snippet ?? "Work with a great team on real products shipped to millions of users.",
    locations: o.locations ?? [], isRemote: o.remote ?? false, season: o.season ?? "Summer 2027",
    tags: o.tags ?? [], qualityScore: o.score ?? 50, source: "greenhouse" as const,
    externalId: o.ext, postedAt: hoursAgo(o.hours), isActive: true,
  };
}

await db.insert(listings).values([
  listing({ co: "stripe", title: "Software Engineering Intern, Summer 2027", ext: "s1", hours: 2, locations: ["San Francisco, CA", "New York, NY"], tags: ["paid", "sponsors-visa"], score: 95 }),
  listing({ co: "databricks", title: "Machine Learning Intern", ext: "d1", hours: 4, locations: ["Mountain View, CA"], tags: ["paid"], score: 80 }),
  listing({ co: "ramp", title: "Backend Engineering Intern", ext: "r1", hours: 6, locations: ["New York, NY"], tags: ["paid", "freshman-ok"], score: 85 }),
  listing({ co: "stripe", title: "iOS Engineering Intern", ext: "s2", hours: 26, remote: true, tags: ["new-grad-ok"], score: 60 }),
  listing({ co: "databricks", title: "Data Platform Intern", ext: "d2", hours: 30, locations: ["Seattle, WA"], tags: ["no-sponsorship"], score: 55 }),
  listing({ co: "ramp", title: "Security Engineering Intern", ext: "r2", hours: 80, locations: ["Remote in USA"], remote: true, season: "Fall 2026", tags: ["paid"], score: 70 }),
]);

console.log(`seeded ${cos.length} companies and 6 listings at ${url}`);
```

- [ ] **Step 6: Verify seed + live scrape against local PGlite**

From the repo root:

```bash
DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/db seed:dev
```

Expected: `seeded 3 companies and 6 listings ...`.

Optional (live network, recommended once): `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/scraper scrape` — expected: JSON summary with `kept > 0`, `errors: []`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: feed queries and local dev seed"
```

---

### Task 14: Feed page — split view, detail panel, saves, keyboard, mobile

**Files:**
- Create: `apps/web/src/lib/format.ts`, `apps/web/src/lib/saved.ts`, `apps/web/src/components/TagPill.tsx`, `apps/web/src/components/DetailPanel.tsx`, `apps/web/src/components/FeedShell.tsx`
- Modify: `apps/web/src/app/page.tsx` (replace placeholder entirely)
- Test: `apps/web/src/lib/format.test.ts`, `apps/web/src/lib/saved.test.ts`, `apps/web/src/components/feedshell.test.ts`

**Interfaces:**
- Consumes: `getFeed`, `getListingById`, `FeedListing` from `@/lib/queries`; `getDb` from `@/lib/db`.
- Produces:
  - `relativeTime(iso: string, now?: Date): string`; `groupListings<T extends { postedAt: string }>(items: T[], now?: Date): { label: string; items: T[] }[]` with labels exactly `"New today" | "Yesterday" | "Earlier"`.
  - `readEntries(kind: "saved" | "applied"): { listingId: number; at: string }[]`, `toggleEntry(kind, listingId)`, `useEntries(kind)` — localStorage keys `interbase.saved` / `interbase.applied`.
  - `FeedShell({ listings: FeedListingDTO[]; initialSelectedId?: number })` and exported type `FeedListingDTO` (same as `FeedListing` but `postedAt: string`), plus exported pure helper `nextId(ids: number[], currentId: number | null, delta: 1 | -1): number | null`.
  - Keyboard: `↓/j` next, `↑/k` previous, `Enter` opens apply in new tab, `s` toggles save — ignored while typing in inputs.
  - Mobile (< md): list only; tapping a row opens the detail as a full-screen overlay with a "← Back to list" button.
  - URL param contract (consumed by page): `q, loc, remote=1, season, visa=1, frosh=1, page, sel`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/format.test.ts` (timezone-naive ISO strings keep this deterministic in any TZ):

```ts
import { describe, expect, it } from "vitest";
import { groupListings, relativeTime } from "./format";

const now = new Date("2026-07-15T12:00:00");

describe("relativeTime", () => {
  it.each([
    ["2026-07-15T11:59:40", "just now"],
    ["2026-07-15T11:30:00", "30m ago"],
    ["2026-07-15T07:00:00", "5h ago"],
    ["2026-07-13T12:00:00", "2d ago"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
  it("falls back to a short date after 7 days", () => {
    expect(relativeTime("2026-06-20T12:00:00", now)).toBe("Jun 20");
  });
});

describe("groupListings", () => {
  it("buckets by calendar day and keeps order New today → Yesterday → Earlier", () => {
    const items = [
      { id: 1, postedAt: "2026-07-15T08:00:00" },
      { id: 2, postedAt: "2026-07-14T20:00:00" },
      { id: 3, postedAt: "2026-07-10T09:00:00" },
    ];
    const groups = groupListings(items, now);
    expect(groups.map((g) => g.label)).toEqual(["New today", "Yesterday", "Earlier"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([1]);
  });
  it("omits empty groups", () => {
    const groups = groupListings([{ postedAt: "2026-07-15T09:00:00" }], now);
    expect(groups.map((g) => g.label)).toEqual(["New today"]);
  });
});
```

`apps/web/src/lib/saved.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readEntries, toggleEntry } from "./saved";

beforeEach(() => window.localStorage.clear());

describe("saved store", () => {
  it("toggles save on and off", () => {
    toggleEntry("saved", 42);
    expect(readEntries("saved").map((e) => e.listingId)).toEqual([42]);
    toggleEntry("saved", 42);
    expect(readEntries("saved")).toEqual([]);
  });
  it("keeps saved and applied separate", () => {
    toggleEntry("saved", 1);
    toggleEntry("applied", 2);
    expect(readEntries("saved").map((e) => e.listingId)).toEqual([1]);
    expect(readEntries("applied").map((e) => e.listingId)).toEqual([2]);
  });
  it("survives corrupted storage", () => {
    window.localStorage.setItem("interbase.saved", "not json");
    expect(readEntries("saved")).toEqual([]);
  });
});
```

`apps/web/src/components/feedshell.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextId } from "./FeedShell";

describe("nextId", () => {
  it("moves down and up, clamping at the ends", () => {
    expect(nextId([1, 2, 3], 1, 1)).toBe(2);
    expect(nextId([1, 2, 3], 3, 1)).toBe(3);
    expect(nextId([1, 2, 3], 2, -1)).toBe(1);
    expect(nextId([1, 2, 3], 1, -1)).toBe(1);
  });
  it("handles empty and unknown selections", () => {
    expect(nextId([], null, 1)).toBeNull();
    expect(nextId([5, 6], null, 1)).toBe(5);
    expect(nextId([5, 6], 99, 1)).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F web test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement apps/web/src/lib/format.ts**

```ts
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GROUPS = ["New today", "Yesterday", "Earlier"] as const;

function dayGroup(iso: string, now: Date): (typeof GROUPS)[number] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const then = new Date(iso);
  if (then >= startOfToday) return "New today";
  if (then >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export function groupListings<T extends { postedAt: string }>(
  items: T[], now = new Date(),
): { label: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const label = dayGroup(item.postedAt, now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(item);
  }
  return GROUPS.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}
```

- [ ] **Step 4: Implement apps/web/src/lib/saved.ts**

```ts
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
```

- [ ] **Step 5: Implement apps/web/src/components/TagPill.tsx**

```tsx
const TAG_LABELS: Record<string, string> = {
  paid: "Paid",
  "sponsors-visa": "Sponsors visa",
  "no-sponsorship": "No sponsorship",
  "new-grad-ok": "New grad OK",
  "freshman-ok": "Freshman friendly",
};

export function TagPill({ tag, label }: { tag?: string; label?: string }) {
  const text = label ?? TAG_LABELS[tag ?? ""] ?? tag ?? "";
  const green = tag === "paid";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${green ? "bg-ok-soft text-ok" : "bg-bg text-muted"}`}>
      {text}
    </span>
  );
}
```

- [ ] **Step 6: Implement apps/web/src/components/DetailPanel.tsx**

```tsx
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
```

- [ ] **Step 7: Implement apps/web/src/components/FeedShell.tsx**

```tsx
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
```

- [ ] **Step 8: Replace apps/web/src/app/page.tsx**

```tsx
import { getDb } from "@/lib/db";
import { getFeed, getListingById, type FeedFilters, type FeedListing } from "@/lib/queries";
import { FeedShell, type FeedListingDTO } from "@/components/FeedShell";

export const dynamic = "force-dynamic";

export type SearchParams = Record<string, string | string[] | undefined>;

// NOT exported: Next.js page files reject unknown runtime exports (type exports are fine).
function parseFilters(sp: SearchParams): FeedFilters & { sel?: number } {
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  return {
    q: str("q"),
    location: str("loc"),
    remote: sp.remote === "1",
    season: str("season"),
    visa: sp.visa === "1",
    frosh: sp.frosh === "1",
    page: Number(str("page") ?? "1") || 1,
    sel: Number(str("sel") ?? "") || undefined,
  };
}

function toDto(l: FeedListing): FeedListingDTO {
  return { ...l, postedAt: l.postedAt.toISOString() };
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { sel, ...filters } = parseFilters(sp);
  const db = getDb();
  const rows = await getFeed(db, filters);
  let dtos = rows.map(toDto);
  if (sel && !dtos.some((d) => d.id === sel)) {
    const extra = await getListingById(db, sel);
    if (extra) dtos = [toDto(extra), ...dtos];
  }
  return <FeedShell listings={dtos} initialSelectedId={sel} />;
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm -F web test && pnpm -F web typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 10: Verify in the browser**

From the repo root:

```bash
DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/db seed:dev
DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev &
sleep 8 && curl -s http://localhost:3000 | grep -o "Software Engineering Intern, Summer 2027" | head -1
```

Expected: the title prints. Then check manually at http://localhost:3000: split view renders, "New today" group shows the 3 freshest rows, clicking rows swaps the detail panel, `j`/`k`/`Enter`/`s` work, saving shows the ★, and narrowing the window to phone width shows list-only with tap-to-open detail. Kill the dev server afterwards.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: split-view feed with detail panel, saves, keyboard nav, mobile sheet"
```

---

### Task 15: Filter chips, search, and pagination

**Files:**
- Create: `apps/web/src/lib/urlstate.ts`, `apps/web/src/components/FilterChips.tsx`
- Modify: `apps/web/src/app/page.tsx` (full replacement shown below)
- Test: `apps/web/src/lib/urlstate.test.ts`

**Interfaces:**
- Consumes: `getSeasons`, `PAGE_SIZE` from `@/lib/queries`; URL param contract from Task 14 (`q, loc, remote, season, visa, frosh, page, sel`).
- Produces:
  - `applyFilter(search: string, key: string, value: string | null): string` — returns `"?…"` or `""`; setting/clearing a filter always drops `page` and `sel`.
  - `withPage(search: string, page: number): string`.
  - `FilterChips({ seasons: string[] })` — client component; search + location inputs are debounced 300ms; all state lives in the URL (`router.replace`, no scroll reset).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/urlstate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyFilter, withPage } from "./urlstate";

describe("applyFilter", () => {
  it("sets and removes keys", () => {
    expect(applyFilter("", "remote", "1")).toBe("?remote=1");
    expect(applyFilter("remote=1", "remote", null)).toBe("");
  });
  it("resets page and sel on any filter change", () => {
    expect(applyFilter("q=swe&page=3&sel=12", "remote", "1")).toBe("?q=swe&remote=1");
  });
  it("empty string value clears the key", () => {
    expect(applyFilter("q=swe", "q", "")).toBe("");
  });
});

describe("withPage", () => {
  it("sets page and preserves filters", () => {
    expect(withPage("q=swe", 2)).toBe("?q=swe&page=2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F web test`
Expected: FAIL — `./urlstate` not found.

- [ ] **Step 3: Implement apps/web/src/lib/urlstate.ts**

```ts
export function applyFilter(search: string, key: string, value: string | null): string {
  const p = new URLSearchParams(search);
  if (value === null || value === "") p.delete(key);
  else p.set(key, value);
  p.delete("page");
  p.delete("sel");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function withPage(search: string, page: number): string {
  const p = new URLSearchParams(search);
  p.set("page", String(page));
  return `?${p.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F web test`
Expected: PASS.

- [ ] **Step 5: Implement apps/web/src/components/FilterChips.tsx**

```tsx
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
```

- [ ] **Step 6: Replace apps/web/src/app/page.tsx (adds chips + load more)**

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  getFeed, getListingById, getSeasons, PAGE_SIZE, type FeedFilters, type FeedListing,
} from "@/lib/queries";
import { FeedShell, type FeedListingDTO } from "@/components/FeedShell";
import { FilterChips } from "@/components/FilterChips";
import { withPage } from "@/lib/urlstate";

export const dynamic = "force-dynamic";

export type SearchParams = Record<string, string | string[] | undefined>;

// NOT exported: Next.js page files reject unknown runtime exports (type exports are fine).
function parseFilters(sp: SearchParams): FeedFilters & { sel?: number } {
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  return {
    q: str("q"),
    location: str("loc"),
    remote: sp.remote === "1",
    season: str("season"),
    visa: sp.visa === "1",
    frosh: sp.frosh === "1",
    page: Number(str("page") ?? "1") || 1,
    sel: Number(str("sel") ?? "") || undefined,
  };
}

function toDto(l: FeedListing): FeedListingDTO {
  return { ...l, postedAt: l.postedAt.toISOString() };
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { sel, ...filters } = parseFilters(sp);
  const db = getDb();
  const [rows, seasons] = await Promise.all([getFeed(db, filters), getSeasons(db)]);
  let dtos = rows.map(toDto);
  if (sel && !dtos.some((d) => d.id === sel)) {
    const extra = await getListingById(db, sel);
    if (extra) dtos = [toDto(extra), ...dtos];
  }
  const currentSearch = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][],
  ).toString();
  return (
    <div>
      <Suspense fallback={null}>
        <FilterChips seasons={seasons} />
      </Suspense>
      <FeedShell listings={dtos} initialSelectedId={sel} />
      {rows.length >= PAGE_SIZE * (filters.page ?? 1) && (
        <div className="mt-6 text-center">
          <Link
            href={withPage(currentSearch, (filters.page ?? 1) + 1)}
            scroll={false}
            className="text-sm font-medium text-accent hover:underline"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify tests, types, and behavior**

Run: `pnpm -F web test && pnpm -F web typecheck`
Expected: PASS.

Then from the repo root: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev &`, open http://localhost:3000 — typing "machine" in search narrows to the Databricks listing after ~300ms, "Remote OK" chip filters, season dropdown shows "Summer 2027"/"Fall 2026", the URL reflects every change, and back/forward restores filters. Kill the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: url-driven filters, search, pagination"
```

---

### Task 16: Saved page + listings-by-id API

**Files:**
- Create: `apps/web/src/app/api/listings/route.ts`, `apps/web/src/app/saved/page.tsx`
- Test: `apps/web/src/app/api/listings/route.test.ts`

**Interfaces:**
- Consumes: `getListingsByIds` from `@/lib/queries`; `getDb`/`setDb` from `@/lib/db`; `useEntries`/`toggleEntry` from `@/lib/saved`; `relativeTime`; `TagPill`; `FeedListingDTO`.
- Produces: `GET /api/listings?ids=1,2,3` → `{ listings: FeedListingDTO[] }` (invalid ids dropped, max 200, includes inactive rows); `/saved` page rendering Saved and Applied sections from localStorage, with expired/missing states.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/api/listings/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings } from "@interbase/db";
import { setDb } from "@/lib/db";
import { GET } from "./route";

describe("GET /api/listings", () => {
  it("returns listings for ids including inactive, drops junk ids", async () => {
    const db = await createTestDb();
    const [co] = await db.insert(companies).values({
      name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
    }).returning();
    const [row] = await db.insert(listings).values({
      companyId: co!.id, companyName: "Stripe", title: "SWE Intern", titleNorm: "swe intern",
      applyUrl: "https://x.com/1", urlCanon: "https://x.com/1", source: "greenhouse",
      externalId: "1", postedAt: new Date(), isActive: false,
    }).returning();
    setDb(db);
    const res = await GET(new Request(`http://test/api/listings?ids=${row!.id},abc,-5,999999`));
    const body = (await res.json()) as { listings: { id: number; isActive: boolean }[] };
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]).toMatchObject({ id: row!.id, isActive: false });
  });

  it("returns empty for no ids", async () => {
    setDb(await createTestDb());
    const res = await GET(new Request("http://test/api/listings"));
    expect(((await res.json()) as { listings: unknown[] }).listings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F web test`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement apps/web/src/app/api/listings/route.ts**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getListingsByIds } from "@/lib/queries";

export async function GET(req: Request) {
  const idsParam = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  const rows = await getListingsByIds(getDb(), ids);
  return NextResponse.json({
    listings: rows.map((l) => ({ ...l, postedAt: l.postedAt.toISOString() })),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F web test`
Expected: PASS.

- [ ] **Step 5: Implement apps/web/src/app/saved/page.tsx**

```tsx
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
```

- [ ] **Step 6: Verify in the browser**

Repo root: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev &` — save two listings on the feed, mark one applied, open /saved: both sections render, Remove works, Apply opens the external posting. Kill the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: saved/applied page backed by localStorage and listings api"
```

---

### Task 17: Company directory + company pages (ISR)

**Files:**
- Create: `apps/web/src/app/companies/page.tsx`, `apps/web/src/app/companies/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCompaniesWithCounts`, `getCompanyBySlug` from `@/lib/queries`; `relativeTime`; `TagPill`.
- Produces: `/companies` and `/companies/[slug]`, both `revalidate = 3600` (ISR — production builds need `DATABASE_URL` available at build time, which Vercel provides).

- [ ] **Step 1: Implement apps/web/src/app/companies/page.tsx**

```tsx
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
```

- [ ] **Step 2: Implement apps/web/src/app/companies/[slug]/page.tsx**

```tsx
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
```

- [ ] **Step 3: Verify**

Run: `pnpm -F web typecheck`
Expected: clean.

Repo root: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev &`, then:
`curl -s http://localhost:3000/companies | grep -o "Stripe" | head -1` → prints `Stripe`;
`curl -s http://localhost:3000/companies/stripe | grep -o "open internship" | head -1` → prints `open internship`;
`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/companies/nope` → `404`. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: company directory and company pages"
```

---

### Task 18: Share permalink /l/[id]

**Files:**
- Create: `apps/web/src/app/l/[id]/page.tsx`

**Interfaces:**
- Consumes: `getListingById` from `@/lib/queries`; `Home` and `SearchParams` re-used from `@/app/page` (Task 15 exports both).
- Produces: `/l/[id]` — renders the feed with that listing selected, sets OpenGraph metadata, and is `noindex` (share permalink, not an SEO surface).

- [ ] **Step 1: Implement apps/web/src/app/l/[id]/page.tsx**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `pnpm -F web typecheck`
Expected: clean.

Repo root: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev &`, find a listing id via `curl -s "http://localhost:3000/api/listings?ids=1,2,3,4,5,6,7,8"` and then:
`curl -s http://localhost:3000/l/<id> | grep -o 'name="robots" content="noindex"'` → prints the noindex meta;
`curl -s http://localhost:3000/l/<id> | grep -o 'og:title'` → prints `og:title`;
`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/l/999999` → `404`. Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: noindexed share permalinks for listings"
```

---

### Task 19: Email digest subscription (double opt-in)

**Files:**
- Create: `apps/web/src/lib/email.ts`, `apps/web/src/app/api/subscribe/route.ts`, `apps/web/src/app/api/confirm/route.ts`, `apps/web/src/app/api/unsubscribe/route.ts`, `apps/web/src/components/SubscribeForm.tsx`
- Modify: `apps/web/src/app/layout.tsx` (footer)
- Test: `apps/web/src/app/api/subscribe/route.test.ts`

**Interfaces:**
- Consumes: `subscribers` table, `getDb`/`setDb`.
- Produces:
  - `sendEmail({ to, subject, html }): Promise<void>` in `@/lib/email` (Resend REST via `fetch`; reads `RESEND_API_KEY`, `FROM_EMAIL`).
  - `POST /api/subscribe` `{ email, frequency? }` → `{ status: "confirmation-sent" | "already-subscribed" }` or 400.
  - `GET /api/confirm?token=` → 302 to `/?subscribed=1` (or `=0` on bad token). `GET /api/unsubscribe?token=` → deletes row, 302 to `/?unsubscribed=1`.
  - `SubscribeForm` client component mounted in the footer.

- [ ] **Step 1: Implement apps/web/src/lib/email.ts**

```ts
export interface EmailMessage { to: string; subject: string; html: string }

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!key || !from) throw new Error("RESEND_API_KEY and FROM_EMAIL are required");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) throw new Error(`resend: HTTP ${res.status} ${await res.text()}`);
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/app/api/subscribe/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@interbase/db/testing";
import { subscribers, type Db } from "@interbase/db";
import { setDb } from "@/lib/db";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
import { sendEmail } from "@/lib/email";
import { POST } from "./route";
import { GET as CONFIRM } from "../confirm/route";
import { GET as UNSUBSCRIBE } from "../unsubscribe/route";

const mockSend = vi.mocked(sendEmail);
let db: Db;

function post(body: unknown) {
  return POST(new Request("http://test/api/subscribe", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

beforeEach(async () => {
  db = await createTestDb();
  setDb(db);
  mockSend.mockClear();
  process.env.BASE_URL = "http://test.local";
});

describe("subscribe flow", () => {
  it("creates an unconfirmed subscriber and emails a confirm link", async () => {
    const res = await post({ email: "student@school.edu", frequency: "daily" });
    expect(((await res.json()) as { status: string }).status).toBe("confirmation-sent");
    const [row] = await db.select().from(subscribers);
    expect(row!.confirmedAt).toBeNull();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0]![0].html).toContain(`http://test.local/api/confirm?token=${row!.confirmToken}`);
  });

  it("rejects invalid emails", async () => {
    expect((await post({ email: "nope" })).status).toBe(400);
  });

  it("confirm sets confirmedAt and redirects; bad token redirects with =0", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    const ok = await CONFIRM(new Request(`http://test/api/confirm?token=${row!.confirmToken}`));
    expect(ok.headers.get("location")).toBe("http://test.local/?subscribed=1");
    const [after] = await db.select().from(subscribers);
    expect(after!.confirmedAt).not.toBeNull();
    const bad = await CONFIRM(new Request("http://test/api/confirm?token=wrong"));
    expect(bad.headers.get("location")).toBe("http://test.local/?subscribed=0");
  });

  it("already-confirmed emails do not get a second confirmation", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    await db.update(subscribers).set({ confirmedAt: new Date() }).where(eq(subscribers.id, row!.id));
    mockSend.mockClear();
    const res = await post({ email: "a@b.edu" });
    expect(((await res.json()) as { status: string }).status).toBe("already-subscribed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("unsubscribe deletes the row", async () => {
    await post({ email: "a@b.edu" });
    const [row] = await db.select().from(subscribers);
    const res = await UNSUBSCRIBE(new Request(`http://test/api/unsubscribe?token=${row!.unsubscribeToken}`));
    expect(res.headers.get("location")).toBe("http://test.local/?unsubscribed=1");
    expect(await db.select().from(subscribers)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm -F web test`
Expected: FAIL — route modules not found.

- [ ] **Step 4: Implement apps/web/src/app/api/subscribe/route.ts**

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  frequency: z.enum(["daily", "weekly"]).default("daily"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { email, frequency } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email));
  if (existing?.confirmedAt) return NextResponse.json({ status: "already-subscribed" });
  let confirmToken: string;
  if (existing) {
    confirmToken = existing.confirmToken;
    await db.update(subscribers).set({ frequency }).where(eq(subscribers.id, existing.id));
  } else {
    confirmToken = randomUUID();
    await db.insert(subscribers).values({
      email, frequency, confirmToken, unsubscribeToken: randomUUID(),
    });
  }
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: "Confirm your interbase digest",
    html: `<p>Click to confirm your ${frequency} digest of new entry-level internships:</p>
<p><a href="${baseUrl}/api/confirm?token=${confirmToken}">Confirm subscription</a></p>
<p>If you didn't request this, ignore this email.</p>`,
  });
  return NextResponse.json({ status: "confirmation-sent" });
}
```

- [ ] **Step 5: Implement confirm and unsubscribe routes**

`apps/web/src/app/api/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const rows = token
    ? await getDb().update(subscribers).set({ confirmedAt: new Date() })
        .where(eq(subscribers.confirmToken, token)).returning()
    : [];
  return NextResponse.redirect(new URL(rows.length ? "/?subscribed=1" : "/?subscribed=0", baseUrl), 302);
}
```

`apps/web/src/app/api/unsubscribe/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscribers } from "@interbase/db";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  if (token) {
    await getDb().delete(subscribers).where(eq(subscribers.unsubscribeToken, token));
  }
  return NextResponse.redirect(new URL("/?unsubscribed=1", baseUrl), 302);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -F web test`
Expected: PASS.

- [ ] **Step 7: Implement apps/web/src/components/SubscribeForm.tsx**

```tsx
"use client";

import { useState } from "react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "already" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, frequency }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { status: string };
      setStatus(data.status === "already-subscribed" ? "already" : "sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") return <p className="text-sm text-ok">Check your inbox to confirm your subscription.</p>;
  if (status === "already") return <p className="text-sm text-muted">You're already subscribed.</p>;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.edu"
        className="w-56 rounded-md border border-border bg-bg px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-muted focus:outline-none"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <button
        type="submit"
        disabled={status === "busy"}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Get new internships by email
      </button>
      {status === "error" && <span className="text-xs text-muted">Something went wrong — try again.</span>}
    </form>
  );
}
```

- [ ] **Step 8: Mount the form — replace the `<footer>` block in apps/web/src/app/layout.tsx**

```tsx
        <footer className="mt-12 border-t border-border bg-surface py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-muted">
            <SubscribeForm />
            <p>interbase — entry-level CS internships, updated daily. Apply links go to official company job boards.</p>
          </div>
        </footer>
```

And add the import at the top of layout.tsx: `import { SubscribeForm } from "@/components/SubscribeForm";`

- [ ] **Step 9: Verify types and commit**

Run: `pnpm -F web test && pnpm -F web typecheck`
Expected: PASS.

```bash
git add -A && git commit -m "feat: email digest subscription with double opt-in"
```

---

### Task 20: Digest sender

**Files:**
- Create: `packages/scraper/src/digest.ts`, `packages/scraper/src/cli-digest.ts`
- Test: `packages/scraper/src/digest.test.ts`

**Interfaces:**
- Consumes: `listings`, `subscribers`, `Db`, `createDb` from `@interbase/db`; `createTestDb` from `@interbase/db/testing`.
- Produces:
  - `buildDigestHtml(items, opts: { baseUrl: string; unsubscribeToken: string; label: string }): string`
  - `sendDigests(db: Db, opts: { resendKey: string; fromEmail: string; baseUrl: string; fetchFn?: typeof fetch; now?: Date }): Promise<{ sent: number }>` — confirmed subscribers only; idempotent per calendar day (`lastDigestSentAt`); weekly only on Mondays (UTC); daily window 24h / weekly 7d over `firstSeenAt`; skips when empty; caps at 50 listings per email.
  - CLI: `pnpm -F @interbase/scraper digest` (used by the Task 11 workflow).

- [ ] **Step 1: Write the failing tests**

`packages/scraper/src/digest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@interbase/db/testing";
import { companies, listings, subscribers, type Db } from "@interbase/db";
import { sendDigests } from "./digest";

// Tuesday 2026-07-14 UTC
const NOW = new Date("2026-07-14T12:00:00Z");
// Monday 2026-07-13 UTC
const MONDAY = new Date("2026-07-13T12:00:00Z");

async function seed(db: Db, opts: { subFrequency?: "daily" | "weekly"; confirmed?: boolean } = {}) {
  const [co] = await db.insert(companies).values({
    name: "Stripe", slug: "stripe", atsType: "greenhouse", atsToken: "stripe", logoColor: "#635bff",
  }).returning();
  await db.insert(listings).values({
    companyId: co!.id, companyName: "Stripe", title: "SWE Intern", titleNorm: "swe intern",
    applyUrl: "https://x.com/1", urlCanon: "https://x.com/1", source: "greenhouse", externalId: "1",
    postedAt: NOW, firstSeenAt: new Date(NOW.getTime() - 3_600_000), lastSeenAt: NOW,
  });
  await db.insert(subscribers).values({
    email: "a@b.edu", frequency: opts.subFrequency ?? "daily",
    confirmToken: "c1", unsubscribeToken: "u1",
    confirmedAt: opts.confirmed === false ? null : NOW,
  });
}

function capture() {
  const calls: { url: string; body: string }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const OPTS = { resendKey: "k", fromEmail: "interbase <digest@test.local>", baseUrl: "http://test.local" };

describe("sendDigests", () => {
  it("sends to confirmed daily subscribers and is idempotent per day", async () => {
    const db = await createTestDb();
    await seed(db);
    const { calls, fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 1 });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.body).toContain("SWE Intern");
    expect(calls[0]!.body).toContain("/api/unsubscribe?token=u1");
    // same day again → no-op
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 });
  });

  it("skips unconfirmed subscribers", async () => {
    const db = await createTestDb();
    await seed(db, { confirmed: false });
    const { fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 });
  });

  it("weekly subscribers only get Monday sends", async () => {
    const db = await createTestDb();
    await seed(db, { subFrequency: "weekly" });
    const { fetchFn } = capture();
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: NOW })).toEqual({ sent: 0 }); // Tuesday
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: MONDAY })).toEqual({ sent: 1 });
  });

  it("skips when there is nothing new in the window", async () => {
    const db = await createTestDb();
    await seed(db);
    const { fetchFn } = capture();
    const muchLater = new Date("2026-08-01T12:00:00Z");
    expect(await sendDigests(db, { ...OPTS, fetchFn, now: muchLater })).toEqual({ sent: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @interbase/scraper test`
Expected: FAIL — `./digest` not found.

- [ ] **Step 3: Implement packages/scraper/src/digest.ts**

```ts
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { listings, subscribers, type Db } from "@interbase/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DigestItem {
  title: string; companyName: string; locations: string[]; isRemote: boolean; applyUrl: string;
}

export function buildDigestHtml(
  items: DigestItem[],
  opts: { baseUrl: string; unsubscribeToken: string; label: string },
): string {
  const rows = items.map((l) =>
    `<li style="margin-bottom:8px"><a href="${l.applyUrl}" style="font-weight:600;color:#4f46e5">${l.title}</a><br/><span style="color:#8b8f96;font-size:13px">${l.companyName} · ${l.isRemote ? "Remote" : l.locations[0] ?? "Location TBA"}</span></li>`,
  ).join("");
  return `<div style="font-family:-apple-system,'Segoe UI',sans-serif;color:#17181a">
<h2 style="font-size:16px">New entry-level internships ${opts.label}</h2>
<ul style="list-style:none;padding:0">${rows}</ul>
<p style="font-size:12px;color:#8b8f96"><a href="${opts.baseUrl}" style="color:#8b8f96">interbase</a> · <a href="${opts.baseUrl}/api/unsubscribe?token=${opts.unsubscribeToken}" style="color:#8b8f96">unsubscribe</a></p>
</div>`;
}

async function sendResendEmail(opts: {
  key: string; from: string; to: string; subject: string; html: string; fetchFn: typeof fetch;
}): Promise<void> {
  const res = await opts.fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${opts.key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) throw new Error(`resend: HTTP ${res.status}`);
}

export async function sendDigests(
  db: Db,
  opts: { resendKey: string; fromEmail: string; baseUrl: string; fetchFn?: typeof fetch; now?: Date },
): Promise<{ sent: number }> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? fetch;
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const isMonday = now.getUTCDay() === 1;

  const subs = await db.select().from(subscribers).where(isNotNull(subscribers.confirmedAt));
  let sent = 0;
  for (const sub of subs) {
    if (sub.lastDigestSentAt && sub.lastDigestSentAt >= startOfToday) continue;
    if (sub.frequency === "weekly" && !isMonday) continue;
    const windowMs = sub.frequency === "daily" ? DAY_MS : 7 * DAY_MS;
    const cutoff = new Date(now.getTime() - windowMs);
    const items: DigestItem[] = await db.select({
      title: listings.title, companyName: listings.companyName, locations: listings.locations,
      isRemote: listings.isRemote, applyUrl: listings.applyUrl,
    }).from(listings)
      .where(and(eq(listings.isActive, true), gte(listings.firstSeenAt, cutoff)))
      .orderBy(desc(listings.postedAt), desc(listings.qualityScore))
      .limit(50);
    if (items.length === 0) continue;
    const label = sub.frequency === "daily" ? "today" : "this week";
    await sendResendEmail({
      key: opts.resendKey, from: opts.fromEmail, to: sub.email, fetchFn,
      subject: `${items.length} new entry-level internship${items.length === 1 ? "" : "s"} ${label}`,
      html: buildDigestHtml(items, { baseUrl: opts.baseUrl, unsubscribeToken: sub.unsubscribeToken, label }),
    });
    await db.update(subscribers).set({ lastDigestSentAt: now }).where(eq(subscribers.id, sub.id));
    sent++;
  }
  return { sent };
}
```

- [ ] **Step 4: Implement packages/scraper/src/cli-digest.ts**

```ts
import { createDb } from "@interbase/db";
import { sendDigests } from "./digest";

const { DATABASE_URL, RESEND_API_KEY, FROM_EMAIL, BASE_URL } = process.env;
if (!DATABASE_URL || !RESEND_API_KEY || !FROM_EMAIL || !BASE_URL) {
  console.error("DATABASE_URL, RESEND_API_KEY, FROM_EMAIL, BASE_URL are required");
  process.exit(1);
}
const { sent } = await sendDigests(createDb(DATABASE_URL), {
  resendKey: RESEND_API_KEY, fromEmail: FROM_EMAIL, baseUrl: BASE_URL,
});
console.log(`digests sent: ${sent}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @interbase/scraper test && pnpm -F @interbase/scraper typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: daily/weekly email digest sender"
```

---

### Task 21: Playwright end-to-end smoke test

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/setup.ts`, `apps/web/e2e/feed.spec.ts`

**Interfaces:**
- Consumes: `pnpm -F @interbase/db seed:dev` (Task 13), the full web app.
- Produces: `pnpm -F web e2e` — seeds a file-backed PGlite at `<repo>/.data/e2e`, boots `next dev` on port 3100, and smoke-tests the core student journey.

- [ ] **Step 1: Create apps/web/playwright.config.ts**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const dbUrl = `pglite://${fileURLToPath(new URL("../../.data/e2e", import.meta.url))}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://localhost:3100",
    env: { DATABASE_URL: dbUrl },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

- [ ] **Step 2: Create apps/web/e2e/setup.ts**

```ts
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const dir = fileURLToPath(new URL("../../../.data/e2e", import.meta.url));
  rmSync(dir, { recursive: true, force: true });
  execSync("pnpm -F @interbase/db seed:dev", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `pglite://${dir}` },
  });
}
```

- [ ] **Step 3: Create apps/web/e2e/feed.spec.ts**

```ts
import { expect, test } from "@playwright/test";

test("browse → filter → keyboard → save → apply link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("New today")).toBeVisible();
  await expect(page.getByRole("button", { name: /Software Engineering Intern, Summer 2027/ })).toBeVisible();

  // search narrows the list
  const search = page.getByPlaceholder("Search roles or companies…");
  await search.fill("machine");
  await expect(page.getByRole("button", { name: /Machine Learning Intern/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Backend Engineering Intern/ })).toHaveCount(0);
  await search.fill("");
  await expect(page.getByRole("button", { name: /Backend Engineering Intern/ })).toBeVisible();

  // keyboard: j moves selection (click a non-input first so keys reach the page)
  await page.getByText("New today").click();
  const heading = page.getByRole("heading", { level: 1 });
  const before = await heading.textContent();
  await page.keyboard.press("j");
  await expect(heading).not.toHaveText(before ?? "__none__");

  // select a listing → detail panel exposes a compliant apply link
  await page.getByRole("button", { name: /Backend Engineering Intern/ }).click();
  const apply = page.getByRole("link", { name: /Apply on Ramp/ });
  await expect(apply).toBeVisible();
  await expect(apply).toHaveAttribute("target", "_blank");
  await expect(apply).toHaveAttribute("rel", "noopener nofollow");

  // save → appears on /saved
  await page.getByRole("button", { name: "☆ Save" }).click();
  await page.goto("/saved");
  await expect(page.getByText(/Backend Engineering Intern/)).toBeVisible();
});
```

- [ ] **Step 4: Install the browser and run**

Run: `pnpm -F web exec playwright install chromium`
Then: `pnpm -F web e2e`
Expected: 1 passed. If the search-clear step flakes, add `await page.waitForURL(/^(?!.*q=)/)` after `search.fill("")`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: e2e smoke for the core student journey"
```

---

### Task 22: README + deployment

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: documented local dev + deploy path; verified green build.

- [ ] **Step 1: Create README.md**

```markdown
# interbase

Entry-level CS internships, scraped daily from official company job boards, in one clean feed.
Students browse, filter, save (no account needed), and apply on the company's official posting.

## How it works

    GitHub Actions (cron, 2×/day)
      └─ packages/scraper → Greenhouse/Lever/Ashby JSON APIs + SimplifyJobs list
          └─ filter (entry-level only) → score → upsert → Neon Postgres
                                                              │
    Vercel ── apps/web (Next.js) ◄────────────────────────────┘
      ├─ /            split-view feed (search, filters, keyboard nav)
      ├─ /saved       localStorage saves & applied tracker
      ├─ /companies   company directory + per-company pages
      └─ /api/*       subscribe / confirm / unsubscribe / listings

## Local development

    pnpm install
    DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/db seed:dev   # sample data
    DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev                  # http://localhost:3000

    pnpm test        # all unit tests (no network, in-memory Postgres)
    pnpm typecheck
    pnpm -F web e2e  # Playwright smoke test

Optionally scrape real data locally: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/scraper scrape`

## Environment variables

| Name | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | web, scraper, migrations | `postgres://…` (Neon) or `pglite://<abs-path>` / `pglite://memory` |
| `RESEND_API_KEY` | digest, subscribe | Resend free tier: 100 emails/day |
| `FROM_EMAIL` | digest, subscribe | e.g. `interbase <digest@yourdomain.com>` |
| `BASE_URL` | digest, subscribe | public site URL, no trailing slash |
| `SIMPLIFY_REPO` | scraper | defaults to `SimplifyJobs/Summer2027-Internships` |

## Deploying

1. **Neon**: create a free project, copy the pooled connection string as `DATABASE_URL`.
2. **Migrate + first scrape** (locally): `DATABASE_URL=<neon-url> pnpm -F @interbase/db migrate && DATABASE_URL=<neon-url> pnpm -F @interbase/scraper scrape`
3. **Vercel**: import the repo, set root directory to `apps/web`, add env vars `DATABASE_URL`, `BASE_URL`, `RESEND_API_KEY`, `FROM_EMAIL`.
4. **Resend**: create an API key; verify a sending domain (or use the onboarding sender for testing).
5. **GitHub**: make the repo public (free Actions), add the same four values as repo secrets, then run the `scrape` workflow once via *Actions → scrape → Run workflow* and confirm it goes green.
6. Visit the site: fresh listings should appear on `/`, companies on `/companies`.

## Maintaining the company seed list

`packages/scraper/companies.seed.json` — add companies with their ATS type and token
(greenhouse: `boards.greenhouse.io/<token>`, lever: `jobs.lever.co/<token>`, ashby: `jobs.ashbyhq.com/<token>`).
Verify a token with the curl checks in `docs/superpowers/plans/2026-07-15-interbase.md` (Task 10) before committing.
Each new internship season, update `SIMPLIFY_REPO` in `.github/workflows/scrape.yml`.
```

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm test`
Expected: every package green.

Run: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web build`
Expected: production build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: readme with local dev and deploy guide"
```

---

## Definition of done

- `pnpm typecheck && pnpm test` green across all three packages; `pnpm -F web e2e` passes.
- A manual `workflow_dispatch` run of the scrape workflow succeeds against Neon and the production site shows real listings within minutes.
- The feed loads in under a second on a cold Neon connection, filters are URL-shareable, saves survive reloads, and a digest email arrives after confirming a subscription.

