import { createDb } from "@interbase/db";
import { sendDigests } from "./digest";

const { DATABASE_URL, RESEND_API_KEY, FROM_EMAIL, BASE_URL } = process.env;
if (!DATABASE_URL || !RESEND_API_KEY || !FROM_EMAIL || !BASE_URL) {
  console.error("DATABASE_URL, RESEND_API_KEY, FROM_EMAIL, BASE_URL are required");
  process.exit(1);
}
const { sent } = await sendDigests(createDb(DATABASE_URL), {
  resendKey: RESEND_API_KEY, fromEmail: FROM_EMAIL, baseUrl: BASE_URL,
});
console.log(`digests sent: ${sent}`);
