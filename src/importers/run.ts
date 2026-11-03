// Runs sources: picks the adapter, processes the result, records health on the source row.
// Each run holds a Postgres advisory lock per source, so the scheduler, "Run now" in the admin
// and the CLI never run the same source twice at once (DESIGN.md §6).
import { sql } from "../db.ts";
import { jsonLdAdapter, extractJsonLdEvents, jsonLdToCandidate } from "./adapters/jsonld.ts";
import { facebookEventId, facebookPageAdapter, fetchFacebookEvent } from "./adapters/facebook.ts";
import { icsAdapter } from "./adapters/ics.ts";
import { poznanPlAdapter } from "./adapters/poznanPl.ts";
import { processCandidates, type ProcessStats } from "./pipeline.ts";
import { SourceConfig, type Adapter, type AdapterResult, type EventCandidate, type SourceRow } from "./types.ts";
import { FetchError, politeFetch } from "./util.ts";

const LOCK_NAMESPACE = 727002;
export const MANUAL_SOURCE_KEY = "manual-url";

const HTML_ADAPTERS: Record<string, Adapter> = {
  poznan_pl: poznanPlAdapter,
};

export function adapterFor(source: SourceRow): Adapter {
  switch (source.kind) {
    case "ICS": return icsAdapter;
    case "JSONLD": return jsonLdAdapter;
    case "FB_PAGE": return withKnownFacebookEvents(facebookPageAdapter);
    case "MANUAL_URL": return refreshKnownItems;
    case "HTML_ADAPTER": {
      const a = HTML_ADAPTERS[source.adapter_name ?? ""];
      if (!a) throw new Error(`Unknown HTML adapter "${source.adapter_name}"`);
      return a;
    }
    default: throw new Error(`No adapter for source kind ${source.kind}`);
  }
}

export const HTML_ADAPTER_NAMES = Object.keys(HTML_ADAPTERS);

export async function loadSource(idOrKey: number | string): Promise<SourceRow | null> {
  const [row] = typeof idOrKey === "number"
    ? await sql`SELECT * FROM sources WHERE id = ${idOrKey}`
    : await sql`SELECT * FROM sources WHERE key = ${idOrKey}`;
  if (!row) return null;
  return { ...row, config: SourceConfig.parse(row.config ?? {}) } as SourceRow;
}

/** Upcoming events this source already knows, with the URL they were imported from. */
async function knownUpcoming(sourceId: number): Promise<{ external_id: string; url: string | null }[]> {
  return (await sql`
    SELECT i.external_id, i.url FROM imported_items i JOIN events e ON e.id = i.event_id
    WHERE i.source_id = ${sourceId} AND coalesce(e.end_at, e.start_at) > now()
    ORDER BY e.start_at LIMIT 100`) as { external_id: string; url: string | null }[];
}

/**
 * Re-reads one known item from its own page. Returns null when the page has no event any more
 * (the caller flags it), throws on network errors (left alone until the next run).
 */
async function refetch(item: { external_id: string; url: string | null }): Promise<EventCandidate | null> {
  const fbId = facebookEventId(item.url ?? "") ?? (/^\d{6,}$/.test(item.external_id) ? item.external_id : null);
  try {
    if (fbId) return await fetchFacebookEvent(fbId);
    if (!item.url) return null;
    const html = await (await politeFetch(item.url, { minIntervalMs: 2000 })).text();
    const all = extractJsonLdEvents(html).map((o) => jsonLdToCandidate(o, item.url!)).filter((c): c is EventCandidate => !!c);
    const c = all.find((x) => x.externalId === item.external_id) ?? (all.length === 1 ? all[0]! : null);
    if (c) c.externalId = item.external_id;
    return c;
  } catch (e) {
    if (e instanceof FetchError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

async function flagGone(sourceId: number, externalIds: string[]) {
  if (!externalIds.length) return;
  await sql`
    WITH gone AS (
      UPDATE imported_items SET missing_since = coalesce(missing_since, now())
      WHERE source_id = ${sourceId} AND external_id = ANY(${sql.array(externalIds, "TEXT")})
      RETURNING event_id
    )
    UPDATE events SET review_flags = array_append(array_remove(review_flags, 'missing_from_source'), 'missing_from_source')
    WHERE id IN (SELECT event_id FROM gone)`;
}

/** MANUAL_URL source: refresh every upcoming event that was imported from a pasted link. */
const refreshKnownItems: Adapter = async (source) => {
  const candidates: EventCandidate[] = [];
  const warnings: string[] = [];
  const gone: string[] = [];
  for (const item of await knownUpcoming(source.id)) {
    try {
      const c = await refetch(item);
      if (c) candidates.push({ ...c, externalId: item.external_id });
      else gone.push(item.external_id);
    } catch (e) {
      warnings.push(`${item.url}: ${(e as Error).message}`);
    }
  }
  await flagGone(source.id, gone);
  return { candidates, complete: false, warnings };
};

/**
 * Logged-out Page listings show only the first few events, so events we already know but that
 * aren't in the listing are re-read from their own pages (catches time changes and cancellations).
 */
function withKnownFacebookEvents(adapter: Adapter): Adapter {
  return async (source) => {
    const result = await adapter(source);
    const listed = new Set(result.candidates.map((c) => c.externalId));
    const gone: string[] = [];
    for (const item of await knownUpcoming(source.id)) {
      if (listed.has(item.external_id)) continue;
      try {
        const c = await refetch(item);
        if (c) result.candidates.push(c);
        else gone.push(item.external_id);
      } catch (e) {
        (result.warnings ??= []).push(`event ${item.external_id}: ${(e as Error).message}`);
      }
    }
    await flagGone(source.id, gone);
    return result;
  };
}

export type RunOutcome =
  | { status: "ok" | "warning"; stats: ProcessStats; warnings: string[] }
  | { status: "error"; error: string }
  | { status: "busy" };

/** Runs one source now. Returns "busy" if another process is already running it. */
export async function runSource(id: number, log: (msg: string) => void = () => {}): Promise<RunOutcome> {
  const conn = await sql.reserve();
  try {
    const [{ locked }] = await conn`SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}, ${id}) AS locked`;
    if (!locked) return { status: "busy" };
    try {
      return await runLocked(id, log);
    } finally {
      await conn`SELECT pg_advisory_unlock(${LOCK_NAMESPACE}, ${id})`;
    }
  } finally {
    conn.release();
  }
}

async function runLocked(id: number, log: (msg: string) => void): Promise<RunOutcome> {
  const source = await loadSource(id);
  if (!source) return { status: "error", error: "source not found" };
  const started = Date.now();
  log(`[import] ${source.name}: start`);
  try {
    const result: AdapterResult = await adapterFor(source)(source);
    const { stats } = await processCandidates(source, result);
    const warnings = result.warnings ?? [];
    const status = warnings.length ? "warning" : "ok";
    await sql`
      UPDATE sources SET last_run_at = now(), last_status = ${status},
        last_error = ${warnings.length ? warnings.slice(0, 10).join("\n").slice(0, 2000) : null},
        events_found = ${stats.received},
        last_stats = ${{ ...stats, durationMs: Date.now() - started }}::jsonb
      WHERE id = ${id}`;
    log(`[import] ${source.name}: ${JSON.stringify(stats)}`);
    return { status, stats, warnings };
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    await sql`
      UPDATE sources SET last_run_at = now(), last_status = 'error', last_error = ${message.slice(0, 2000)}
      WHERE id = ${id}`;
    log(`[import] ${source.name}: error: ${message}`);
    return { status: "error", error: message };
  }
}

/** Runs every enabled source whose schedule interval has elapsed, one at a time. */
export async function runDueSources(log: (msg: string) => void = console.log): Promise<void> {
  const due = await sql`
    SELECT id FROM sources
    WHERE enabled AND kind <> 'LLM_PAGE' AND (last_run_at IS NULL OR last_run_at + schedule <= now())
    ORDER BY last_run_at NULLS FIRST`;
  for (const { id } of due) await runSource(id, log);
}

// ---------- import from URL ----------

export class ImportUrlError extends Error {
  constructor(public code: "unsupported_url" | "no_event_found" | "fetch_failed") {
    super(code);
  }
}

async function manualSource(): Promise<SourceRow> {
  await sql`
    INSERT INTO sources (key, name, kind, trust, schedule)
    VALUES (${MANUAL_SOURCE_KEY}, 'Manual URL imports', 'MANUAL_URL', 'AUTO_PUBLISH', '1 day')
    ON CONFLICT (key) DO NOTHING`;
  return (await loadSource(MANUAL_SOURCE_KEY))!;
}

/**
 * Admin "import from URL": a Facebook event link or any page with schema.org Event data becomes
 * an event, published unless the manual source is set to REVIEW (or links to an existing
 * duplicate). Returns the event id to open in the editor.
 */
export async function importFromUrl(rawUrl: string): Promise<{ eventId: number; created: boolean }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    throw new ImportUrlError("unsupported_url");
  }
  const fbId = facebookEventId(url.href);
  let candidate: EventCandidate | null = null;
  try {
    if (fbId) {
      candidate = await fetchFacebookEvent(fbId);
    } else {
      const html = await (await politeFetch(url.href, { minIntervalMs: 1000 })).text();
      const all = extractJsonLdEvents(html).map((o) => jsonLdToCandidate(o, url.href)).filter((c): c is EventCandidate => !!c);
      const now = Date.now();
      candidate = all.find((c) => c.url === url.href.replace(/#.*$/, ""))
        ?? all.find((c) => (c.end ?? c.start).getTime() > now)
        ?? all[0] ?? null;
      if (candidate && all.length > 1) candidate.externalId = candidate.url ?? candidate.externalId;
    }
  } catch (e) {
    if (e instanceof ImportUrlError) throw e;
    throw new ImportUrlError("fetch_failed");
  }
  if (!candidate) throw new ImportUrlError("no_event_found");
  if (!fbId && !candidate.url) candidate.url = url.href;

  const source = await manualSource();
  const { stats, eventIds } = await processCandidates(source, { candidates: [candidate], complete: false }, { manual: true });
  const eventId = eventIds.get(candidate.externalId);
  if (!eventId) throw new ImportUrlError("no_event_found");
  return { eventId, created: stats.created > 0 };
}
