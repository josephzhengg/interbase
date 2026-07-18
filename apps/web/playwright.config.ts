import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const dbUrl = `pglite://${fileURLToPath(new URL("../../.data/e2e", import.meta.url))}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm exec next dev -p 3100",
    // Port check (TCP connect), not an HTTP url check: Playwright always finishes
    // starting+waiting-on webServer *before* running globalSetup, and the app is
    // force-dynamic (every page queries the DB). An HTTP check would 500 forever
    // against the not-yet-seeded PGlite dir and time out before globalSetup ever
    // runs. A raw port check succeeds as soon as Next's listener binds, letting
    // globalSetup seed the DB before the first real (DB-touching) request lands.
    port: 3100,
    env: { DATABASE_URL: dbUrl },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
