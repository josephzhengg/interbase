# interbase — Design Spec

**Date:** 2026-07-15
**Status:** Approved pending final user review

## 1. Overview

interbase is a public website that surfaces the freshest entry-level computer-science industry internships (and new-grad-friendly roles), updated automatically every day by a scraper. Students and new grads browse a fast split-view feed, filter, save listings in their browser, and click **Apply**, which opens the company's official posting in a new tab.

**Goals**

- Fresh: new postings appear on the site within hours of publication, every day, hands-off.
- Entry-level only: automated rules keep senior/experienced roles out.
- Quality-ranked: better opportunities surface first via a simple scoring rubric.
- Clean and simple: scanning 50 postings should feel effortless, on desktop and mobile.
- Free to run: every component fits free tiers (Vercel, Neon, GitHub Actions, Resend).

**Non-goals (v1)**

- No user accounts, resume storage, or on-site application submission (Apply always links out).
- No scraping of LinkedIn/Indeed or any source that prohibits it — only public ATS JSON APIs and community GitHub lists.
- No admin review queue; curation is fully automated.
- Deferred: dark mode, cross-device sync, Workday adapter, per-listing SEO pages, analytics.

**Assumed scope:** US + remote roles (what the sources cover). A `sponsors-visa` tag lets international students filter.

## 2. Decisions log

| Decision | Choice |
|---|---|
| Apply model | Link out to official posting (no on-site applications) |
| Data sources | Public ATS JSON APIs (Greenhouse, Lever, Ashby) + SimplifyJobs community GitHub list |
| Audience / budget | Public site on free/cheap infrastructure |
| Curation | Auto-filter + quality score, fully hands-off |
| V1 extras | localStorage saved listings, "new today" freshness focus, company pages, email digest |
| Architecture | Next.js + Neon Postgres + GitHub Actions cron scraper (single TypeScript monorepo) |
| Feed layout | Split view: compact list left, detail panel right (mobile: list + slide-over) |
| Visual style | "Paper" — white, hairline borders, single indigo accent |

## 3. Architecture

pnpm workspace monorepo, TypeScript throughout, Node 22:

```
interbase/
├── apps/web          # Next.js (App Router) — deployed on Vercel free tier
├── packages/db       # Drizzle ORM schema + Neon Postgres client (shared by web & scraper)
└── packages/scraper  # source adapters, filter/score pipeline, digest sender
```

- **Scraper:** runs via GitHub Actions cron twice daily (~07:00 and ~19:00 ET). Actions has no serverless timeout limits and is free for public repos. The workflow runs `pnpm --filter scraper start`, then the digest step.
- **Web:** Next.js App Router; server components read Postgres directly via `packages/db`. Route handlers only for subscribe/confirm/unsubscribe. Tailwind CSS with Paper design tokens as CSS variables.
- **Database:** Neon Postgres free tier. Drizzle ORM + drizzle-kit migrations.
- **Email:** Resend free tier (100/day, 3,000/mo). Operational limit: ~90 confirmed daily-digest subscribers before a paid plan or weekly-only fallback is needed; acceptable for v1.
- **Validation:** Zod schemas for all adapter payloads and API inputs.

Boundaries: the scraper only writes the DB; the web app only reads it (plus the subscribers table). Neither imports from the other — both depend on `packages/db`.

## 4. Data model

**companies**
- `id` (pk), `name`, `slug` (unique), `website`
- `ats_type` enum: `greenhouse | lever | ashby | github_list`
- `ats_token` (board/org token for the ATS API; null for github_list-discovered companies)
- `logo_color` (hex, generated from name hash) — avatars are colored initials, no logo scraping
- `created_at`

**listings**
- `id` (pk), `company_id` (fk)
- `title`, `apply_url` (canonical), `description_snippet` (first ~500 chars, plain text)
- `locations` text[] , `is_remote` boolean
- `season` (nullable, e.g. "Summer 2027" — parsed from title)
- `tags` text[] — from: `paid`, `sponsors-visa`, `no-sponsorship`, `new-grad-ok`, `freshman-ok`
- `quality_score` int 0–100 (ranking only, never used to exclude)
- `source` enum (same values as ats_type), `external_id`
- `posted_at` (from source when available, else first_seen_at), `first_seen_at`, `last_seen_at`
- `is_active` boolean
- `search` tsvector (generated: title + company name), GIN-indexed
- Unique index on `(source, external_id)`; index on `(is_active, posted_at desc)`

**subscribers**
- `id`, `email` (unique), `frequency` enum `daily | weekly`
- `confirm_token`, `confirmed_at` (nullable — double opt-in), `unsubscribe_token`, `created_at`

**Dedupe:** primary key is `(source, external_id)`. Cross-source duplicates (same job from ATS API and the GitHub list) are collapsed by matching `(company_id, normalized_title, canonical_url)`, where canonical_url strips query strings/fragments and lowercases the host; the ATS-sourced record wins because it's richer.

## 5. Scraper pipeline

Every adapter implements one interface: `fetch(): Promise<RawListing[]>`.

**Adapters**
- **Greenhouse:** `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
- **Lever:** `GET api.lever.co/v0/postings/{org}?mode=json`
- **Ashby:** `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true`
- **GitHub list:** fetch `listings.json` from the SimplifyJobs Summer internships repo (raw.githubusercontent.com); companies discovered here that we don't track get created with `ats_type: github_list`.

The company seed list (~150 curated companies with strong internship programs, with their ATS type + token) lives at `packages/scraper/companies.seed.json` and is upserted into `companies` at the start of each run.

**Pipeline per run** — fetch → normalize → filter → score → upsert → expire:

1. **Fetch** with per-adapter error isolation: one failing source logs and continues; the run publishes whatever succeeded. Run summary (per-source counts, failures) printed to the Actions log.
2. **Normalize** into `RawListing` (Zod-validated); parse season via `/(Summer|Fall|Winter|Spring)\s*20\d{2}/i`.
3. **Entry-level filter** (both conditions required):
   - Title **must match**: `/\b(intern(ship)?|co[- ]?op)\b/i` or `/\b(new grad(uate)?|university grad(uate)?|early career|entry[- ]level)\b/i`
   - Title **must not match**: `/\b(senior|staff|principal|lead|manager|director|architect|phd|mba)\b/i`
4. **Tags** from description/compensation fields:
   - `paid`: ATS compensation data present, or description matches `/\$\s?\d|\/(hour|hr)\b|hourly|stipend/i`
   - `no-sponsorship`: `/(unable|not able|cannot|will not|no)\s+(?:\w+\s+){0,3}sponsor/i`
   - `sponsors-visa`: mentions sponsorship/CPT/OPT positively **and** `no-sponsorship` didn't match
   - `new-grad-ok`: title/description matches new-grad patterns
   - `freshman-ok`: `/freshman|sophomore|all years|underclassmen|first[- ]year students/i`
5. **Quality score** (additive, 0–100, ranking only): known company from seed list +30 · `paid` +20 · sponsorship stated either way +15 (clarity is the value) · at least one concrete location or remote +10 · description ≥ 300 chars +10 · posted within 7 days +15.
6. **Upsert** on `(source, external_id)`; update `last_seen_at`; apply cross-source dedupe.
7. **Expire:** `is_active = false` when a listing is absent from its source for 5 consecutive days, or `posted_at` is older than 60 days.

## 6. Web app

**Routes**
- `/` — the feed (split view)
- `/saved` — saved + applied listings (reads localStorage, client component)
- `/companies` — directory; `/companies/[slug]` — company page with its active listings (ISR, revalidated hourly, for SEO)
- `/l/[id]` — shareable permalink: server-renders OpenGraph meta for the listing, then shows the feed with that listing selected. Noindexed — it exists for sharing, not SEO (full per-listing SEO pages are deferred)
- `POST /api/subscribe`, `GET /api/confirm?token=`, `GET /api/unsubscribe?token=`

**Feed behavior**
- Left column: compact rows (title, company · location · relative time), grouped **New today / Yesterday / Earlier**, ordered `posted_at desc, quality_score desc`. Paginated "Load more" after 50 rows.
- Right column: detail panel — company line, title, tag pills, posted time, description snippet, **Apply on {Company} ↗** (new tab, `rel="noopener nofollow"`), **☆ Save**, **Mark applied**.
- Filter chips above the list: search box, location, remote, season, sponsors-visa, freshman-friendly. All filter state lives in the URL query string, so filtered views are shareable and back/forward work. Filtering triggers a server query (no full-client dataset).
- Search: Postgres `websearch_to_tsquery` against the `search` tsvector, with `ILIKE` prefix fallback for short queries.
- Keyboard: `↑/↓` (and `j/k`) move selection, `Enter` opens the apply link, `s` toggles save.
- Mobile (< 768px): list only; tapping a row slides the detail panel over as a full-height sheet with a back affordance.

**Saved listings (no account)**
- `localStorage["interbase.saved"]` and `["interbase.applied"]`: arrays of `{listingId, at}`. `/saved` hydrates listing data by id from the server; missing/inactive listings render with an "expired" state instead of disappearing.

**Email digest**
- Footer form → `POST /api/subscribe` → confirmation email (double opt-in) → confirmed subscribers get a digest after the morning scrape: daily = listings first seen since the last daily send; weekly = Monday, past 7 days. Skips sending when there is nothing new. Every email has a one-click unsubscribe link. Digest template: plain, Paper-styled HTML — company · title · location · apply link, grouped by day.

## 7. Design system — "Paper"

- Page `#fafafa`, cards/surfaces `#ffffff`, hairline borders `#e7e8ea`
- Text `#17181a`, secondary `#8b8f96`
- Accent (links, Apply button, active chips) indigo `#4f46e5`; accent-soft bg `#eef0fe`
- Positive (Paid tag, "new" dot) `#189a4e` on `#e9f8ef`
- Radius 8px cards / 6px controls; system font stack (`-apple-system, Segoe UI, Inter, sans-serif`)
- Density first: 13–14px list typography, generous line-height, whitespace over dividers wherever possible
- All tokens as CSS variables under `:root` so a dark theme can be added later without redesign

## 8. Error handling & operations

- Scraper failure = failed GitHub Actions run (GitHub emails the owner). Partial failures still publish successful sources.
- The site never depends on a fresh scrape: if runs are missed, the feed serves the latest data; group headers naturally shift.
- Digest job is idempotent per (subscriber, date) — a `last_digest_sent_at` column on subscribers prevents double sends on retries.
- Neon free-tier sleep: first query may cold-start; acceptable. ISR keeps company pages served statically regardless.
- `.superpowers/` and `.env*` gitignored; secrets (DATABASE_URL, RESEND_API_KEY) live in GitHub Actions secrets and Vercel env vars.

## 9. Testing strategy

Built TDD (superpowers:test-driven-development):

- **Filter/score/tag rules** — the core product promise — get exhaustive unit tests using fixture JSON captured from real Greenhouse/Lever/Ashby responses. Every future misclassification (a senior role slipping through, a mislabeled tag) becomes a new regression fixture.
- **Adapters** — parsing tests against recorded fixtures only; no live network in tests.
- **Dedupe/expiry** — unit tests over an in-memory or test database covering upsert, cross-source collapse, and the 5-day/60-day expiry rules.
- **Web** — one Playwright smoke test: load feed → filter → keyboard-select → save → apply link has correct href/target; plus a subscribe API test covering the double-opt-in flow.

## 10. Future (explicitly out of v1)

Dark mode · accounts/cross-device sync · Workday adapter · admin review UI · per-listing SEO pages · privacy-friendly analytics · digest personalization (filter-based digests).
