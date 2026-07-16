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
