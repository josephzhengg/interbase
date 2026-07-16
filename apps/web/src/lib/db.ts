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
