// Public event queries. Only PUBLISHED events are listed; the detail page also shows CANCELLED.
import { sql, TZ } from "../db.ts";
import type { Filters } from "../shared/filters.ts";
import type { EventDetail, PublicEvent } from "../shared/types.ts";

const EMPTY = sql``;

/** Turns free text into a prefix tsquery: "plansz gosu" -> "plansz:* & gosu:*", "d&d" -> "d:* & d:*". */
export function toPrefixQuery(q: string): string | null {
  // Split on punctuation too, matching how to_tsvector tokenizes ("D&D" -> d, d).
  const tokens = q
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

/** Shared SELECT list producing the PublicEvent JSON shape. */
const PUBLIC_COLUMNS = sql`
  e.id, e.slug, e.title,
  left(regexp_replace(e.description, '\s+', ' ', 'g'), 220) AS excerpt,
  e.category, e.tags, e.start_at, e.end_at, e.is_free,
  e.price_min::float8 AS price_min, e.price_max::float8 AS price_max, e.currency,
  e.language, e.beginner_friendly, e.ticket_url, e.status,
  e.series_id IS NOT NULL AS is_recurring,
  CASE WHEN v.id IS NULL THEN NULL ELSE json_build_object(
    'id', v.id, 'name', v.name, 'address', v.address, 'district', v.district,
    'lat', CASE WHEN v.is_approximate_location THEN round(v.lat::numeric, 2)::float8 ELSE v.lat END,
    'lon', CASE WHEN v.is_approximate_location THEN round(v.lon::numeric, 2)::float8 ELSE v.lon END
  ) END AS venue,
  CASE WHEN o.id IS NULL THEN NULL ELSE json_build_object('id', o.id, 'name', o.name) END AS organizer`;

function toIso<T extends { start_at: unknown; end_at: unknown }>(row: T): T {
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d);
  return { ...row, start_at: iso(row.start_at), end_at: iso(row.end_at) };
}

export interface QueryOptions {
  now?: Date;
  limit?: number;
}

export async function queryEvents(f: Filters, { now = new Date(), limit = 500 }: QueryOptions = {}) {
  const window = f.from
    ? sql`event_window('range', ${now}, ${TZ}, ${f.from}::date, ${f.to ?? f.from}::date)`
    : sql`event_window(${f.when}, ${now}, ${TZ})`;
  const tsq = f.q ? toPrefixQuery(f.q) : null;

  const rows = await sql`
    SELECT ${PUBLIC_COLUMNS}
    FROM events e
    CROSS JOIN ${window} w
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.status = 'PUBLISHED'
      AND e.start_at < w.range_end
      AND coalesce(e.end_at, e.start_at + interval '3 hours') > w.range_start
      ${f.cats.length ? sql`AND e.category = ANY(${sql.array(f.cats)}::category[])` : EMPTY}
      ${f.tags.length ? sql`AND e.tags @> ${sql.array(f.tags, "TEXT")}` : EMPTY}
      ${f.free ? sql`AND e.is_free` : EMPTY}
      ${f.beginner ? sql`AND e.beginner_friendly` : EMPTY}
      ${f.english ? sql`AND e.language IN ('en', 'both')` : EMPTY}
      ${f.multiday ? sql`AND e.end_at - e.start_at >= interval '20 hours'` : EMPTY}
      ${f.time === "evening" ? sql`AND (e.start_at AT TIME ZONE ${TZ})::time >= '17:00'` : EMPTY}
      ${f.time === "day" ? sql`AND (e.start_at AT TIME ZONE ${TZ})::time < '17:00'` : EMPTY}
      ${f.priceMax !== null ? sql`AND (e.is_free OR coalesce(e.price_min, 0) <= ${f.priceMax})` : EMPTY}
      ${f.bbox
        ? sql`AND v.lon BETWEEN ${f.bbox[0]} AND ${f.bbox[2]} AND v.lat BETWEEN ${f.bbox[1]} AND ${f.bbox[3]}`
        : EMPTY}
      ${f.q
        ? sql`AND (
            ${tsq ? sql`event_search_doc(e.title, e.description) @@ to_tsquery('simple', f_unaccent(${tsq})) OR` : EMPTY}
            f_unaccent(lower(${f.q})) <% f_unaccent(lower(e.title))
            OR f_unaccent(lower(v.name)) LIKE '%' || f_unaccent(lower(${f.q})) || '%'
            OR f_unaccent(lower(o.name)) LIKE '%' || f_unaccent(lower(${f.q})) || '%'
          )`
        : EMPTY}
    ORDER BY e.start_at, e.id
    LIMIT ${limit}`;
  return (rows as PublicEvent[]).map(toIso);
}

/** Detail page: PUBLISHED or CANCELLED (a cancelled event keeps its URL with a banner). */
export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  const [row] = await sql`
    SELECT ${PUBLIC_COLUMNS}, e.description, e.source_url, e.image_url, e.updated_at,
           v.website AS venue_website, o.website AS organizer_website
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE e.slug = ${slug} AND e.status IN ('PUBLISHED', 'CANCELLED')`;
  if (!row) return null;
  return { ...toIso(row), updated_at: (row.updated_at as Date).toISOString() } as EventDetail;
}
