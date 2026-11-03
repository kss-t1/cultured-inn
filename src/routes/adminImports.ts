// /api/admin: import sources, review queue, merge, import from URL.
import { sql } from "../db.ts";
import { HTML_ADAPTER_NAMES, ImportUrlError, importFromUrl, loadSource, MANUAL_SOURCE_KEY, runSource } from "../importers/run.ts";
import { SourceConfig } from "../importers/types.ts";
import { HttpError, json, parseId, readJson } from "../lib/http.ts";
import { BulkInput, ImportUrlInput, MergeInput, SourceInput } from "../shared/schemas.ts";
import { admin } from "./admin.ts";
import { z } from "zod";

// ---------- review queue ----------

/** Review page rows: recent imports, flagged events, and submissions still waiting as drafts. */
export function reviewRows(now = new Date()) {
  return sql`
    SELECT e.id, e.title, e.category, e.status, e.start_at, e.end_at, e.review_flags, e.source_url,
           e.venue_id, v.name AS venue_name, s.name AS source_name, s.key AS source_key,
           coalesce(i.location_text, sub.location_text) AS location_text,
           sub.id IS NOT NULL AS submitted, sub.contact_name, sub.contact_email,
           coalesce((
             SELECT json_agg(d ORDER BY d.sim DESC) FROM (
               SELECT d.id, d.title, d.status, d.start_at, v2.name AS venue_name,
                      round(similarity(f_unaccent(lower(d.title)), f_unaccent(lower(e.title)))::numeric, 2)::float8 AS sim
               FROM events d LEFT JOIN venues v2 ON v2.id = d.venue_id
               WHERE d.id <> e.id AND d.status <> 'HIDDEN'
                 AND d.start_at BETWEEN e.start_at - interval '90 minutes' AND e.start_at + interval '90 minutes'
                 AND similarity(f_unaccent(lower(d.title)), f_unaccent(lower(e.title))) >= 0.35
               ORDER BY sim DESC LIMIT 3) d
           ), '[]') AS duplicates
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN sources s ON s.id = e.source_id
    LEFT JOIN LATERAL (
      SELECT location_text FROM imported_items WHERE event_id = e.id ORDER BY id LIMIT 1
    ) i ON true
    LEFT JOIN LATERAL (
      SELECT id, location_text, contact_name, contact_email FROM submissions WHERE event_id = e.id ORDER BY id LIMIT 1
    ) sub ON true
    WHERE ((e.origin = 'IMPORTED' AND e.status IN ('DRAFT', 'PUBLISHED') AND e.created_at > ${now}::timestamptz - interval '7 days')
           OR (e.status = 'DRAFT' AND (e.origin = 'IMPORTED' OR sub.id IS NOT NULL)) OR e.review_flags <> '{}')
      AND coalesce(e.end_at, e.start_at) > ${now}::timestamptz - interval '1 day'
    ORDER BY (e.review_flags <> '{}' OR e.status = 'DRAFT') DESC, e.start_at
    LIMIT 300`;
}

const listReview = admin<"/api/admin/review">(async () => json(await reviewRows()));

const bulkReview = admin<"/api/admin/review/bulk">(async (req) => {
  const { ids, action } = BulkInput.parse(await readJson(req));
  const ids_ = sql.array(ids, "INT4");
  if (action === "dismiss_flags") {
    await sql`UPDATE events SET review_flags = '{}', updated_at = now() WHERE id = ANY(${ids_})`;
  } else {
    const status = action === "publish" ? "PUBLISHED" : "HIDDEN";
    await sql`
      UPDATE events SET status = ${status}::event_status, review_flags = '{}', updated_at = now()
      WHERE id = ANY(${ids_})`;
  }
  return json({ ok: true });
});

/**
 * Merges event :id into `into`: the imported items now point at `into` (so future imports update
 * or keep linking to it), empty fields on `into` are filled in, and :id is deleted.
 */
const mergeEvent = admin<"/api/admin/events/:id/merge">(async (req) => {
  const id = parseId(req.params.id);
  const { into } = MergeInput.parse(await readJson(req));
  if (id === into) throw new HttpError(400, "merge_into_self");
  await sql.begin(async (tx) => {
    const [a] = await tx`SELECT * FROM events WHERE id = ${id} FOR UPDATE`;
    const [b] = await tx`SELECT * FROM events WHERE id = ${into} FOR UPDATE`;
    if (!a || !b) throw new HttpError(404, "not_found");
    await tx`UPDATE imported_items SET event_id = ${into} WHERE event_id = ${id}`;
    await tx`
      UPDATE events SET
        description = CASE WHEN description = '' THEN ${a.description} ELSE description END,
        venue_id = coalesce(venue_id, ${a.venue_id}), organizer_id = coalesce(organizer_id, ${a.organizer_id}),
        end_at = coalesce(end_at, ${a.end_at}), ticket_url = coalesce(ticket_url, ${a.ticket_url}),
        source_url = coalesce(source_url, ${a.source_url}), image_url = coalesce(image_url, ${a.image_url}),
        price_min = coalesce(price_min, ${a.price_min}), price_max = coalesce(price_max, ${a.price_max}),
        updated_at = now()
      WHERE id = ${into}`;
    await tx`DELETE FROM events WHERE id = ${id}`;
  });
  return json({ ok: true, id: into });
});

const importUrl = admin<"/api/admin/import-url">(async (req) => {
  const { url } = ImportUrlInput.parse(await readJson(req));
  try {
    return json(await importFromUrl(url));
  } catch (e) {
    if (e instanceof ImportUrlError) throw new HttpError(e.code === "fetch_failed" ? 502 : 422, e.code);
    throw e;
  }
});

// ---------- sources ----------

/** Sources being run from this process right now ("Run now" responds before the run ends). */
const running = new Set<number>();

const SOURCE_COLUMNS = sql`
  s.id, s.key, s.name, s.kind, s.url, s.adapter_name, s.config, s.default_category,
  s.default_venue_id, s.default_organizer_id, s.trust, s.enabled,
  (extract(epoch FROM s.schedule) / 3600)::int AS schedule_hours,
  s.last_run_at, s.last_status, s.last_error, s.events_found, s.last_stats`;

async function getSource(id: number) {
  const [row] = await sql`SELECT ${SOURCE_COLUMNS} FROM sources s WHERE s.id = ${id}`;
  if (!row) throw new HttpError(404, "not_found");
  return { ...row, running: running.has(id) };
}

const listSources = admin<"/api/admin/sources">(async () => {
  const rows = await sql`
    SELECT ${SOURCE_COLUMNS},
      (SELECT count(*)::int FROM events e WHERE e.source_id = s.id AND e.start_at > now() AND e.status = 'PUBLISHED') AS upcoming_published,
      (SELECT count(*)::int FROM events e WHERE e.source_id = s.id AND e.start_at > now() AND e.status = 'DRAFT') AS upcoming_drafts
    FROM sources s ORDER BY s.kind = 'MANUAL_URL', s.name`;
  return json({
    sources: rows.map((r: { id: number }) => ({ ...r, running: running.has(r.id) })),
    adapters: HTML_ADAPTER_NAMES,
    apify: Boolean(process.env.APIFY_TOKEN),
  });
});

/** Validates `config` (zod shape plus compilable regexes); errors are reported on the config field. */
function parseConfig(raw: Record<string, unknown>) {
  const r = SourceConfig.safeParse(raw);
  if (!r.success) throw new z.ZodError([{ code: "custom", message: "invalid_config", path: ["config"], input: raw }]);
  const patterns = [r.data.exclude, ...(r.data.rules ?? []).map((x) => x.match)].filter((p): p is string => !!p);
  for (const p of patterns) {
    try {
      new RegExp(p, "i");
    } catch {
      throw new z.ZodError([{ code: "custom", message: "invalid_regex", path: ["config"], input: p }]);
    }
  }
  return r.data;
}

function sourceValues(s: SourceInput, config: SourceConfig) {
  return sql`
    name = ${s.name}, key = ${s.key}, kind = ${s.kind}::source_kind, url = ${s.url},
    adapter_name = ${s.kind === "HTML_ADAPTER" ? s.adapter_name : null}, config = ${config}::jsonb,
    default_category = ${s.default_category}::category, default_venue_id = ${s.default_venue_id},
    default_organizer_id = ${s.default_organizer_id}, trust = ${s.trust}::source_trust,
    enabled = ${s.enabled}, schedule = make_interval(hours => ${s.schedule_hours})`;
}

const createSource = admin<"/api/admin/sources">(async (req) => {
  const s = SourceInput.parse(await readJson(req));
  const config = parseConfig(s.config);
  const [row] = await sql`INSERT INTO sources (name, kind) VALUES (${s.name}, ${s.kind}::source_kind) RETURNING id`;
  await sql`UPDATE sources SET ${sourceValues(s, config)} WHERE id = ${row.id}`;
  return json(await getSource(row.id), { status: 201 });
});

const showSource = admin<"/api/admin/sources/:id">(async (req) => json(await getSource(parseId(req.params.id))));

const updateSource = admin<"/api/admin/sources/:id">(async (req) => {
  const id = parseId(req.params.id);
  const [existing] = await sql`SELECT kind, key FROM sources WHERE id = ${id}`;
  if (!existing) throw new HttpError(404, "not_found");
  if (existing.kind === "MANUAL_URL") {
    // The built-in "import from URL" source: only the on/off switch and schedule are editable.
    const body = z.object({ enabled: z.boolean(), schedule_hours: z.number().int().min(1).max(168) }).parse(await readJson(req));
    await sql`UPDATE sources SET enabled = ${body.enabled}, schedule = make_interval(hours => ${body.schedule_hours}) WHERE id = ${id}`;
    return json(await getSource(id));
  }
  const s = SourceInput.parse(await readJson(req));
  await sql`UPDATE sources SET ${sourceValues(s, parseConfig(s.config))} WHERE id = ${id}`;
  return json(await getSource(id));
});

const deleteSource = admin<"/api/admin/sources/:id">(async (req) => {
  const id = parseId(req.params.id);
  // Events stay (source_id is SET NULL); the imported items go with the source.
  await sql`DELETE FROM sources WHERE id = ${id} AND key IS DISTINCT FROM ${MANUAL_SOURCE_KEY}`;
  return json({ ok: true });
});

const runSourceNow = admin<"/api/admin/sources/:id/run">(async (req) => {
  const id = parseId(req.params.id);
  if (!(await loadSource(id))) throw new HttpError(404, "not_found");
  if (running.has(id)) throw new HttpError(409, "source_busy");
  running.add(id);
  // Some sources take minutes (poznan.pl asks for 10 s between requests): answer right away
  // and let the admin UI poll the source until `running` turns false.
  runSource(id, console.log)
    .catch((e) => console.error("[import] run failed", e))
    .finally(() => running.delete(id));
  return json({ started: true }, { status: 202 });
});

export const adminImportRoutes = {
  "/api/admin/review": { GET: listReview },
  "/api/admin/review/bulk": { POST: bulkReview },
  "/api/admin/events/:id/merge": { POST: mergeEvent },
  "/api/admin/import-url": { POST: importUrl },
  "/api/admin/sources": { GET: listSources, POST: createSource },
  "/api/admin/sources/:id": { GET: showSource, PUT: updateSource, DELETE: deleteSource },
  "/api/admin/sources/:id/run": { POST: runSourceNow },
};
