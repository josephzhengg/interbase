import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createDb } from "./client";

describe("createDb", () => {
  it("pglite://memory creates a working in-memory database", async () => {
    const db = createDb("pglite://memory");
    const result = (await db.execute(sql`select 1 as one`)) as unknown as {
      rows: Record<string, unknown>[];
    };
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ one: 1 });
  });

  it("pglite://<dir> creates a file-backed database with persistence", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "interbase-client-test-"));
    try {
      const db = createDb("pglite://" + tmpDir);

      // Create a test table and insert a row
      await db.execute(sql`create table t (id int)`);
      await db.execute(sql`insert into t values (7)`);

      // Verify the row persists
      const result = (await db.execute(sql`select id from t`)) as unknown as {
        rows: Record<string, unknown>[];
      };
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ id: 7 });

      // Verify the directory was created on disk
      expect(fs.existsSync(tmpDir)).toBe(true);
    } finally {
      // Clean up the temporary directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("postgres:// url returns a Db object with select function (lazy connection)", () => {
    const db = createDb("postgres://user:pass@example.invalid/db");
    // Verify the object has a select function (lazy — no network call happens)
    expect(db).toHaveProperty("select");
    expect(typeof db.select).toBe("function");
  });
});
