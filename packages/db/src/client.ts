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
