import { createRequire } from "node:module";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string): Db {
  if (url.startsWith("pglite://")) {
    // PGlite is loaded lazily so production (postgres://) bundles never
    // require it — Vercel's file tracing does not ship it to functions.
    const require = createRequire(import.meta.url);
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } =
      require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    const path = url.slice("pglite://".length);
    const client = path === "memory" ? new PGlite() : new PGlite(path);
    return drizzlePglite(client, { schema }) as unknown as Db;
  }
  return drizzleNeon(neon(url), { schema }) as unknown as Db;
}
