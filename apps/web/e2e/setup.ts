import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  const dir = fileURLToPath(new URL("../../../.data/e2e", import.meta.url));
  rmSync(dir, { recursive: true, force: true });
  // PGlite's directory creation is non-recursive; ensure the parent .data/ dir
  // exists on fresh clones before seeding creates the e2e/ subdirectory.
  mkdirSync(fileURLToPath(new URL("../../../.data", import.meta.url)), { recursive: true });
  execSync("pnpm -F @interbase/db seed:dev", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `pglite://${dir}` },
  });
}
