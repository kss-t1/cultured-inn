import { sql, TZ } from "../src/db.ts";

export async function resetDb() {
  await sql`TRUNCATE events, venues, organizers, admin_sessions, admin_users, login_attempts RESTART IDENTITY CASCADE`;
}

let n = 0;
/** Inserts a PUBLISHED event; `start`/`end` are Europe/Warsaw wall-clock "YYYY-MM-DD HH:MM". */
export async function addEvent(o: {
  start: string; end?: string; title?: string; category?: string; status?: string;
  venueId?: number | null; isFree?: boolean; priceMin?: number | null; tags?: string[];
  language?: string; beginner?: boolean; description?: string;
}) {
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const title = o.title ?? `Event ${++n}`;
  const [row] = await sql`
    INSERT INTO events (city_id, title, slug, description, category, start_at, end_at, venue_id, is_free,
                        price_min, tags, language, beginner_friendly, status)
    VALUES (${city.id}, ${title}, ${`ev-${n}-${Math.random().toString(36).slice(2, 8)}`}, ${o.description ?? ""},
            ${o.category ?? "BOARDGAMES"}::category,
            (${o.start}::timestamp AT TIME ZONE ${TZ}),
            (${o.end ?? null}::timestamp AT TIME ZONE ${TZ}),
            ${o.venueId ?? null}, ${o.isFree ?? false}, ${o.priceMin ?? null},
            ${sql.array(o.tags ?? [], "TEXT")}, ${o.language ?? "pl"}::event_language,
            ${o.beginner ?? false}, ${o.status ?? "PUBLISHED"}::event_status)
    RETURNING id, slug`;
  return row as { id: number; slug: string };
}

export async function addVenue(name: string, lat: number | null, lon: number | null) {
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const [row] = await sql`INSERT INTO venues (city_id, name, lat, lon) VALUES (${city.id}, ${name}, ${lat}, ${lon}) RETURNING id`;
  return row.id as number;
}

/** A timestamptz for a Warsaw wall-clock time, e.g. warsaw("2026-10-23 10:00"). */
export async function warsaw(local: string): Promise<Date> {
  const [r] = await sql`SELECT (${local}::timestamp AT TIME ZONE ${TZ}) AS t`;
  return r.t;
}
