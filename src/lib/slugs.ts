// Unique event slugs: "<title>-<YYYY-MM-DD>", then -2, -3... on collision.
import { sql } from "../db.ts";
import { slugify } from "../shared/slug.ts";

/** `localDate` is the Warsaw date "YYYY-MM-DD" (anything longer is cut). */
export async function uniqueSlug(title: string, localDate: string): Promise<string> {
  const base = `${slugify(title)}-${localDate.slice(0, 10)}`;
  const taken = new Set(
    (await sql`SELECT slug FROM events WHERE slug = ${base} OR slug LIKE ${base + "-%"}`).map(
      (r: { slug: string }) => r.slug,
    ),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
