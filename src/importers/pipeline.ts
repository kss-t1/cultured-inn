// Import pipeline (DESIGN.md §5): classify → filter → match venue → dedupe → upsert → publish policy.
import { sql, TZ } from "../db.ts";
import { uniqueSlug } from "../lib/slugs.ts";
import { classify, type Category } from "../shared/categories.ts";
import type { AdapterResult, EventCandidate, SourceRow } from "./types.ts";
import { distanceKm, isLocal, utcToZoned } from "./util.ts";

export type SkipReason =
  | "no_title" | "excluded" | "rule_skip" | "no_match" | "out_of_area" | "past" | "cancelled" | "rejected";

export interface ProcessStats {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  linked: number;
  missing: number;
  skipped: Partial<Record<SkipReason, number>>;
}

export interface ProcessOptions {
  now?: Date;
  /** Admin-initiated import (URL import): never drop the item, flag it instead. */
  manual?: boolean;
}

export const DUPLICATE_SIMILARITY = 0.6;
export const DUPLICATE_WINDOW_MIN = 90;

// ---------- classification ----------

export type Decision =
  | { keep: true; category: Category; tags: string[]; guessed: boolean }
  | { keep: false; reason: SkipReason };

/** Source rules first, then keyword rules, then the source default (DESIGN.md §5 step 3). */
export function decide(source: SourceRow, c: EventCandidate, manual = false): Decision {
  const cfg = source.config;
  const fields = cfg.matchOn ?? ["title", "description"];
  const text = [
    fields.includes("title") ? c.title : "",
    fields.includes("description") ? c.description : "",
    c.classifyHint ?? "",
  ].join("\n");
  const baseTags = cfg.tags ?? [];

  if (cfg.exclude && new RegExp(cfg.exclude, "i").test(`${c.title}\n${c.description}`) && !manual) {
    return { keep: false, reason: "excluded" };
  }
  for (const rule of cfg.rules ?? []) {
    if (!new RegExp(rule.match, "i").test(text)) continue;
    if (rule.skip) return manual ? fallback() : { keep: false, reason: "rule_skip" };
    const category = rule.category ?? classify(text)[0] ?? source.default_category;
    if (category) return { keep: true, category, tags: [...baseTags, ...(rule.tags ?? [])], guessed: false };
  }
  // Keywords in the title beat ones in the description ("board game night ... one-shot RPG corner").
  const byKeyword = classify(`${fields.includes("title") ? c.title : ""}\n${c.classifyHint ?? ""}`)[0]
    ?? (fields.includes("description") ? classify(c.description)[0] : undefined);
  if (byKeyword) return { keep: true, category: byKeyword, tags: baseTags, guessed: false };
  if (source.default_category && !cfg.requireMatch) {
    return { keep: true, category: source.default_category, tags: baseTags, guessed: false };
  }
  return manual ? fallback() : { keep: false, reason: "no_match" };

  function fallback(): Decision {
    return { keep: true, category: source.default_category ?? "BOARDGAMES", tags: baseTags, guessed: true };
  }
}

// ---------- venue matching ----------

/** Lowercase, no diacritics, punctuation as spaces, padded: for whole-word containment checks. */
export function norm(s: string): string {
  return ` ${s
    .replace(/[łŁ]/g, "l")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ul|al|os|pl)\.?\s/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

interface VenueRow {
  id: number;
  name: string;
  address: string | null;
  aliases: string[];
  lat: number | null;
  lon: number | null;
}

/**
 * Finds the venue by name/alias or street address appearing in the location text, then by
 * coordinates (within 75 m). Longest name match wins ("Druga Era Klub Fantastyki" over "Druga Era").
 */
export function matchVenue(venues: VenueRow[], c: Pick<EventCandidate, "locationName" | "address" | "lat" | "lon">): number | null {
  const text = norm(`${c.locationName ?? ""} ${c.address ?? ""}`);
  if (text.trim()) {
    let best: { id: number; len: number } | null = null;
    for (const v of venues) {
      const needles = [v.name, ...v.aliases];
      // "Rybaki 22, 61-884 Poznań" -> "rybaki 22": a street with a number is specific enough.
      const street = v.address?.split(",")[0];
      if (street && /\d/.test(street)) needles.push(street);
      for (const n of needles) {
        const nn = norm(n);
        if (nn.trim().length >= 4 && text.includes(nn) && (!best || nn.length > best.len)) best = { id: v.id, len: nn.length };
      }
    }
    if (best) return best.id;
  }
  if (c.lat != null && c.lon != null) {
    let best: { id: number; d: number } | null = null;
    for (const v of venues) {
      if (v.lat == null || v.lon == null) continue;
      const d = distanceKm({ lat: c.lat, lon: c.lon }, { lat: v.lat, lon: v.lon });
      if (d <= 0.075 && (!best || d < best.d)) best = { id: v.id, d };
    }
    if (best) return best.id;
  }
  return null;
}

async function loadVenues(): Promise<VenueRow[]> {
  return (await sql`SELECT id, name, address, aliases, lat, lon FROM venues`) as VenueRow[];
}

/** Places with a name and coordinates (Facebook, ticketing sites) become venues automatically. */
async function createVenue(c: EventCandidate, cityId: number): Promise<VenueRow | null> {
  if (!c.locationName || c.lat == null || c.lon == null) return null;
  const name = c.locationName.split(",")[0]!.trim().slice(0, 200);
  if (name.length < 3) return null;
  const [row] = await sql`
    INSERT INTO venues (city_id, name, address, lat, lon)
    VALUES (${cityId}, ${name}, ${c.address ?? null}, ${c.lat}, ${c.lon})
    RETURNING id, name, address, aliases, lat, lon`;
  return row as VenueRow;
}

// ---------- storage ----------

/** Content fingerprint: an unchanged item skips all writes except last_seen_at. */
function contentHash(c: EventCandidate, d: Decision): string {
  const { raw: _raw, ...rest } = c;
  return new Bun.CryptoHasher("sha256").update(JSON.stringify([rest, d])).digest("hex");
}

const localDate = (d: Date) => {
  const z = utcToZoned(d, TZ);
  return `${z.y}-${String(z.mo).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
};

async function findDuplicate(c: EventCandidate, venueId: number | null, sourceId: number): Promise<number | null> {
  const [row] = await sql`
    SELECT e.id
    FROM events e
    WHERE e.start_at BETWEEN ${c.start}::timestamptz - make_interval(mins => ${DUPLICATE_WINDOW_MIN})
                         AND ${c.start}::timestamptz + make_interval(mins => ${DUPLICATE_WINDOW_MIN})
      AND (${venueId}::int IS NULL OR e.venue_id IS NULL OR e.venue_id = ${venueId})
      AND similarity(f_unaccent(lower(e.title)), f_unaccent(lower(${c.title}))) >= ${DUPLICATE_SIMILARITY}
      AND NOT EXISTS (SELECT 1 FROM imported_items i WHERE i.event_id = e.id AND i.source_id = ${sourceId})
    ORDER BY similarity(f_unaccent(lower(e.title)), f_unaccent(lower(${c.title}))) DESC
    LIMIT 1`;
  return row?.id ?? null;
}

async function upsertSeries(source: SourceRow, c: EventCandidate): Promise<number | null> {
  if (!c.seriesKey) return null;
  const [row] = await sql`
    INSERT INTO event_series (title, rrule, external_key)
    VALUES (${c.title}, ${c.seriesRule ?? ""}, ${`${source.id}:${c.seriesKey}`})
    ON CONFLICT (external_key) DO UPDATE
      SET rrule = CASE WHEN EXCLUDED.rrule = '' THEN event_series.rrule ELSE EXCLUDED.rrule END,
          title = CASE WHEN EXCLUDED.rrule = '' THEN event_series.title ELSE EXCLUDED.title END,
          updated_at = now()
    RETURNING id`;
  return row.id;
}

function eventFields(c: EventCandidate, d: Extract<Decision, { keep: true }>) {
  return {
    title: c.title.slice(0, 300),
    description: c.description,
    category: d.category,
    tags: d.tags,
    start: c.start,
    end: c.end,
    priceMin: c.isFree ? null : (c.priceMin ?? null),
    priceMax: c.isFree ? null : (c.priceMax ?? null),
    isFree: c.isFree ?? false,
    ticketUrl: c.ticketUrl ?? null,
    sourceUrl: c.url ?? null,
    imageUrl: c.imageUrl ?? null,
  };
}

/**
 * Stores what an adapter returned. Items are keyed by (source, external_id): known items update
 * the event they created (unless an admin edited it), new ones become events or link to a
 * duplicate. With a complete result, known future events the source no longer lists are flagged.
 */
export async function processCandidates(
  source: SourceRow, result: AdapterResult, opts: ProcessOptions = {},
): Promise<{ stats: ProcessStats; eventIds: Map<string, number> }> {
  const now = opts.now ?? new Date();
  const runStart = new Date();
  const stats: ProcessStats = { received: result.candidates.length, created: 0, updated: 0, unchanged: 0, linked: 0, missing: 0, skipped: {} };
  const skip = (r: SkipReason) => (stats.skipped[r] = (stats.skipped[r] ?? 0) + 1);
  const eventIds = new Map<string, number>();
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const venues = await loadVenues();
  const recentPast = new Date(now.getTime() - 12 * 3_600_000);

  for (const c of result.candidates) {
    c.title = c.title.replace(/\s+/g, " ").trim();
    if (!c.title) {
      skip("no_title");
      continue;
    }
    const d = decide(source, c, opts.manual);
    if (!d.keep) {
      skip(d.reason);
      continue;
    }
    if (!opts.manual && !isLocal(c)) {
      skip("out_of_area");
      continue;
    }
    if (!opts.manual && (c.end ?? c.start) < recentPast) {
      skip("past");
      continue;
    }

    const hash = contentHash(c, d);
    const locationText = [c.locationName, c.address].filter(Boolean).join(", ") || null;
    let [item] = await sql`
      SELECT i.id, i.content_hash, i.event_id, e.source_id AS event_source_id, e.origin, e.import_locked, e.status
      FROM imported_items i LEFT JOIN events e ON e.id = i.event_id
      WHERE i.source_id = ${source.id} AND i.external_id = ${c.externalId}`;
    if (item && !item.event_id && opts.manual) {
      // Re-importing by hand something an admin deleted earlier: start over.
      await sql`DELETE FROM imported_items WHERE id = ${item.id}`;
      item = undefined;
    }

    if (item) {
      await sql`
        UPDATE imported_items SET last_seen_at = now(), missing_since = NULL,
          content_hash = ${hash}, raw = ${c.raw as object}::jsonb, url = ${c.url ?? null}, location_text = ${locationText}
        WHERE id = ${item.id}`;
      if (!item.event_id) {
        skip("rejected"); // the admin deleted the event: don't bring it back
        continue;
      }
      eventIds.set(c.externalId, item.event_id);
      await sql`UPDATE events SET last_seen_at = now(), review_flags = array_remove(review_flags, 'missing_from_source')
                WHERE id = ${item.event_id} AND 'missing_from_source' = ANY(review_flags)`;
      if (item.content_hash === hash) {
        stats.unchanged++;
        continue;
      }
      const owned = item.event_source_id === source.id && item.origin === "IMPORTED";
      if (!owned) {
        stats.unchanged++; // linked duplicate: the event belongs to another source or an admin
        continue;
      }
      if (item.import_locked) {
        await sql`UPDATE events SET review_flags = array_append(array_remove(review_flags, 'changed_at_source'), 'changed_at_source')
                  WHERE id = ${item.event_id}`;
        stats.updated++;
        continue;
      }
      const f = eventFields(c, d);
      const venueId = matchVenue(venues, c);
      const seriesId = await upsertSeries(source, c);
      await sql`
        UPDATE events SET
          title = ${f.title}, description = ${f.description}, category = ${f.category}::category,
          tags = ${sql.array(f.tags, "TEXT")}, start_at = ${f.start}, end_at = ${f.end},
          price_min = ${f.priceMin}, price_max = ${f.priceMax}, is_free = ${f.isFree},
          ticket_url = ${f.ticketUrl}, source_url = ${f.sourceUrl}, image_url = ${f.imageUrl},
          venue_id = coalesce(${venueId}, venue_id), series_id = coalesce(${seriesId}, series_id),
          review_flags = CASE WHEN ${venueId}::int IS NOT NULL THEN array_remove(review_flags, 'needs_venue') ELSE review_flags END,
          status = CASE WHEN ${c.cancelled ?? false} AND status IN ('PUBLISHED', 'DRAFT') THEN 'CANCELLED'::event_status ELSE status END,
          updated_at = now()
        WHERE id = ${item.event_id}`;
      stats.updated++;
      continue;
    }

    // New item.
    if (c.cancelled && !opts.manual) {
      skip("cancelled");
      continue;
    }
    let venueId = matchVenue(venues, c);
    if (venueId === null && isLocal(c)) {
      const created = await createVenue(c, city.id);
      if (created) {
        venues.push(created);
        venueId = created.id;
      }
    }
    venueId ??= source.default_venue_id;

    const duplicateOf = await findDuplicate(c, venueId, source.id);
    let eventId: number;
    if (duplicateOf) {
      eventId = duplicateOf;
      stats.linked++;
    } else {
      const f = eventFields(c, d);
      const flags = [
        ...(venueId === null && locationText ? ["needs_venue"] : []),
        ...(d.guessed ? ["check_category"] : []),
      ];
      const publish = source.trust === "AUTO_PUBLISH" && venueId !== null && !d.guessed && !opts.manual;
      const slug = await uniqueSlug(f.title, localDate(f.start));
      const seriesId = await upsertSeries(source, c);
      const [row] = await sql`
        INSERT INTO events (city_id, title, slug, description, category, tags, start_at, end_at,
                            venue_id, organizer_id, price_min, price_max, is_free, ticket_url, source_url,
                            image_url, status, origin, source_id, series_id, review_flags, last_seen_at)
        VALUES (${city.id}, ${f.title}, ${slug}, ${f.description}, ${f.category}::category,
                ${sql.array(f.tags, "TEXT")}, ${f.start}, ${f.end}, ${venueId},
                ${source.default_organizer_id ?? (await matchOrganizer(c.organizerName))},
                ${f.priceMin}, ${f.priceMax}, ${f.isFree}, ${f.ticketUrl}, ${f.sourceUrl}, ${f.imageUrl},
                ${c.cancelled ? "CANCELLED" : publish ? "PUBLISHED" : "DRAFT"}::event_status, 'IMPORTED',
                ${source.id}, ${seriesId}, ${sql.array(flags, "TEXT")}, now())
        RETURNING id`;
      eventId = row.id;
      stats.created++;
    }
    eventIds.set(c.externalId, eventId);
    await sql`
      INSERT INTO imported_items (source_id, external_id, content_hash, raw, event_id, url, location_text)
      VALUES (${source.id}, ${c.externalId}, ${hash}, ${c.raw as object}::jsonb, ${eventId}, ${c.url ?? null}, ${locationText})`;
  }

  if (result.complete) stats.missing = await flagMissing(source, runStart, now, result.horizon ?? null);
  return { stats, eventIds };
}

async function matchOrganizer(name: string | null | undefined): Promise<number | null> {
  if (!name) return null;
  const [row] = await sql`SELECT id FROM organizers WHERE f_unaccent(lower(name)) = f_unaccent(lower(${name.trim()})) LIMIT 1`;
  return row?.id ?? null;
}

/**
 * DESIGN.md §5 step 7: an upcoming event that vanished from a complete listing is flagged for
 * review, never deleted (it may have been cancelled, or the source may be glitching).
 */
async function flagMissing(source: SourceRow, runStart: Date, now: Date, horizon: Date | null): Promise<number> {
  const rows = await sql`
    WITH gone AS (
      UPDATE imported_items i SET missing_since = now()
      FROM events e
      WHERE i.source_id = ${source.id} AND e.id = i.event_id
        AND i.last_seen_at < ${runStart} AND i.missing_since IS NULL
        AND e.start_at > ${now} AND (${horizon}::timestamptz IS NULL OR e.start_at <= ${horizon})
        AND e.source_id = ${source.id}
      RETURNING i.event_id
    )
    UPDATE events SET review_flags = array_append(array_remove(review_flags, 'missing_from_source'), 'missing_from_source')
    WHERE id IN (SELECT event_id FROM gone)
    RETURNING id`;
  return rows.length;
}
