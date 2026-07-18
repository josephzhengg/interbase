import { mkdirSync } from "node:fs";
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
const dir = url.slice("pglite://".length);
mkdirSync(dir, { recursive: true });
const db = drizzle(new PGlite(dir), { schema });
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
