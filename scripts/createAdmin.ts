// Creates or resets an admin user. Usage: bun run admin:create <email>
// The password is read from the ADMIN_PASSWORD env var or prompted for (no echo is not
// available in plain Bun, so prefer the env var in shared terminals).
import { sql } from "../src/db.ts";
import { hashPassword } from "../src/lib/auth.ts";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: bun run admin:create <email>");
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD ?? prompt("Password (min. 12 chars):") ?? "";
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const hash = await hashPassword(password);
const [row] = await sql`
  INSERT INTO admin_users (email, password_hash) VALUES (${email}, ${hash})
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  RETURNING id, (xmax = 0) AS created`;
// A password reset invalidates existing sessions.
if (!row.created) await sql`DELETE FROM admin_sessions WHERE user_id = ${row.id}`;
console.log(`${row.created ? "Created" : "Updated password for"} admin ${email} (id ${row.id}).`);
await sql.close();
