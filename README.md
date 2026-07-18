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

pnpm is provisioned via [corepack](https://nodejs.org/api/corepack.html): run `corepack enable` once,
or prefix every command below with `corepack pnpm` if you'd rather not enable it globally.

    pnpm install
    DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/db seed:dev   # sample data
    DATABASE_URL=pglite://$PWD/.data/dev pnpm -F web dev                  # http://localhost:3000

    pnpm test        # all unit tests (no network, in-memory Postgres)
    pnpm typecheck
    pnpm -F web e2e  # Playwright smoke test (first run: pnpm -F web exec playwright install chromium)

Optionally scrape real data locally: `DATABASE_URL=pglite://$PWD/.data/dev pnpm -F @interbase/scraper scrape`

## Environment variables

| Name | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | web, scraper, migrations | `postgres://…` (Neon) or `pglite://<abs-path>` / `pglite://memory` |
| `RESEND_API_KEY` | digest, subscribe | Resend free tier: 100 emails/day |
| `FROM_EMAIL` | digest, subscribe | e.g. `interbase <digest@yourdomain.com>` |
| `BASE_URL` | digest, subscribe | public site URL, no trailing slash |
| `SIMPLIFY_REPO` | scraper | defaults to `SimplifyJobs/Summer2026-Internships` |

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
When the next season's repo appears, update the default in `packages/scraper/src/run.ts` and `.github/workflows/scrape.yml`.
