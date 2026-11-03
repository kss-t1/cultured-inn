// Applies db/migrations/NNN_*.sql in order, each in its own transaction,
// recording applied files in schema_migrations. Usage: bun db/migrate.ts
import { Glob } from "bun";
import { sql } from "../src/db.ts";

export async function migrate(log: (msg: string) => void = console.log) {
  // Advisory locks are per-connection, so hold one connection for the whole run.
  const conn = await sql.reserve();
  try {
    await conn`SELECT pg_advisory_lock(727001)`;
    await conn`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set(
      (await conn`SELECT name FROM schema_migrations`).map((r: { name: string }) => r.name),
    );
    const dir = new URL("./migrations/", import.meta.url).pathname;
    const files = [...new Glob("*.sql").scanSync(dir)].sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await Bun.file(dir + file).text();
      await conn.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      log(`applied ${file}`);
    }
    await conn`SELECT pg_advisory_unlock(727001)`;
  } finally {
    conn.release();
  }
}

if (import.meta.main) {
  await migrate();
  await sql.close();
}
