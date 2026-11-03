// Facebook events, without the Graph API (Meta closed public-event access in 2018).
//
// * Event pages (facebook.com/events/<id>) are readable logged-out. The page embeds the event as
//   JSON in <script type="application/json"> blocks: name, start/end timestamps, place, address,
//   description, cover image, host, is_canceled.
// * A Page's upcoming_hosted_events tab, fetched logged-out, lists the first few events with ids
//   for many Pages; for others Facebook returns a login wall. The "apify" provider (paid, needs
//   APIFY_TOKEN) covers those.
//
// We never log in and only read public pages, a few requests per Page per day.
import type { Adapter, EventCandidate } from "../types.ts";
import { BROWSER_UA, excerpt, politeFetch } from "../util.ts";

const FB_INTERVAL_MS = 4000;
const BROWSER_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/** Event id from any facebook.com event URL (with or without slug, m., mbasic., query). */
export function facebookEventId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)facebook\.com$|(^|\.)fb\.me$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/events\/(?:[^/]+\/)*?(\d{6,})/);
    return m ? m[1]! : u.searchParams.get("event_id");
  } catch {
    return null;
  }
}

export const facebookEventUrl = (id: string) => `https://www.facebook.com/events/${id}/`;

/** Parsed JSON blobs embedded in a Facebook page. */
function jsonBlobs(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]!));
    } catch {
      // ignore
    }
  }
  return out;
}

function walk(v: unknown, fn: (o: Record<string, any>) => void, depth = 0) {
  if (!v || typeof v !== "object" || depth > 80) return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, fn, depth + 1);
    return;
  }
  fn(v as Record<string, any>);
  for (const x of Object.values(v)) walk(x, fn, depth + 1);
}

/**
 * Extracts the event `id` from an event page. Fields are spread over several objects that share
 * the event id; related "suggested events" on the same page have other ids and are ignored.
 */
export function parseFacebookEvent(html: string, id: string): EventCandidate | null {
  const ev: Record<string, any> = {};
  let endTs: number | null = null;
  const blobs = jsonBlobs(html);
  for (const b of blobs) {
    walk(b, (o) => {
      if (o.id === id) {
        for (const [k, v] of Object.entries(o)) if (ev[k] == null && v != null) ev[k] = v;
      }
    });
  }
  if (!ev.name || typeof ev.start_timestamp !== "number") return null;
  // The end time arrives in a deferred fragment ({path:["event"], data:{start_timestamp,end_timestamp}}).
  for (const b of blobs) {
    walk(b, (o) => {
      if (o.start_timestamp === ev.start_timestamp && typeof o.end_timestamp === "number" && o.end_timestamp > 0) {
        endTs ??= o.end_timestamp;
      }
    });
  }
  const place = ev.event_place ?? null;
  const description: string = ev.event_description?.text ?? "";
  const hosts: any[] = ev.event_hosts_that_can_view_guestlist ?? [];
  const cover = ev.cover_media_renderer?.cover_photo?.photo?.full_image?.uri
    ?? ev.cover_media_renderer?.cover_photo?.photo?.image?.uri
    ?? null;
  const ticket = typeof ev.event_buy_ticket_url === "string" ? ev.event_buy_ticket_url : null;
  return {
    externalId: id,
    title: String(ev.name).trim(),
    description: excerpt(description),
    start: new Date(ev.start_timestamp * 1000),
    end: endTs ? new Date(endTs * 1000) : null,
    locationName: place?.contextual_name ?? place?.name ?? null,
    address: typeof ev.one_line_address === "string" ? ev.one_line_address : null,
    lat: place?.location?.latitude ?? null,
    lon: place?.location?.longitude ?? null,
    url: facebookEventUrl(id),
    ticketUrl: ticket,
    imageUrl: cover,
    organizerName: hosts[0]?.name ?? ev.event_creator?.name ?? null,
    cancelled: ev.is_canceled === true,
    raw: {
      id, name: ev.name, start_timestamp: ev.start_timestamp, end_timestamp: endTs,
      day_time_sentence: ev.day_time_sentence, event_place: place, one_line_address: ev.one_line_address,
      is_canceled: ev.is_canceled, is_online: ev.is_online, hosts: hosts.map((h) => h?.name), description,
    },
  };
}

/**
 * Event ids listed on a Page's upcoming_hosted_events tab. `null` means the list wasn't in the
 * page at all (login wall or changed markup), as opposed to an empty list.
 */
export function parsePageEventIds(html: string): string[] | null {
  let found = false;
  const ids = new Set<string>();
  for (const b of jsonBlobs(html)) {
    walk(b, (o) => {
      if (o.pageItems && Array.isArray(o.pageItems.edges)) {
        found = true;
        for (const edge of o.pageItems.edges) {
          const node = edge?.node?.node;
          if (node?.__typename === "Event" && /^\d+$/.test(node.id)) ids.add(node.id);
        }
      }
    });
  }
  return found ? [...ids] : null;
}

export async function fetchFacebookEvent(id: string): Promise<EventCandidate | null> {
  const res = await politeFetch(facebookEventUrl(id), { headers: BROWSER_HEADERS, minIntervalMs: FB_INTERVAL_MS });
  return parseFacebookEvent(await res.text(), id);
}

/**
 * URL of a Page's events tab. Pages have either a handle (facebook.com/<handle>) or only a numeric
 * profile id (facebook.com/profile.php?id=<id>), where tabs are selected with `sk`.
 * `tab` is "upcoming_hosted_events" (logged-out list) or "events" (what the Apify actor accepts).
 */
export function pageEventsUrl(pageUrl: string, tab: "upcoming_hosted_events" | "events" = "upcoming_hosted_events"): string {
  const u = new URL(pageUrl);
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (first === "profile.php") {
    const id = u.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) throw new Error(`Not a Facebook Page URL: ${pageUrl}`);
    return `https://www.facebook.com/profile.php?id=${id}&sk=${tab}`;
  }
  if (!first) throw new Error(`Not a Facebook Page URL: ${pageUrl}`);
  return `https://www.facebook.com/${first}/${tab}`;
}

async function direct(pageUrl: string): Promise<{ candidates: EventCandidate[]; blocked: boolean; warnings: string[] }> {
  const res = await politeFetch(pageEventsUrl(pageUrl), { headers: BROWSER_HEADERS, minIntervalMs: FB_INTERVAL_MS });
  const ids = parsePageEventIds(await res.text());
  if (ids === null) return { candidates: [], blocked: true, warnings: [] };
  const candidates: EventCandidate[] = [];
  const warnings: string[] = [];
  for (const id of ids) {
    try {
      const c = await fetchFacebookEvent(id);
      if (c) candidates.push(c);
      else warnings.push(`event ${id}: no event data in page`);
    } catch (e) {
      warnings.push(`event ${id}: ${(e as Error).message}`);
    }
  }
  return { candidates, blocked: false, warnings };
}

// ---------- Apify (paid fallback) ----------

const APIFY_ACTOR = "apify~facebook-events-scraper";
/** Apify bills per event and returns past events too (newest first), so keep this small. */
const APIFY_MAX_EVENTS = 10;

/**
 * Maps an item of the apify/facebook-events-scraper dataset. A recurring event comes as one item
 * with `childEvents` (one per occurrence, each with its own id and times); those become separate
 * candidates sharing the series' details.
 */
export function apifyToCandidates(it: Record<string, any>): EventCandidate[] {
  const id = String(it.id ?? facebookEventId(String(it.url ?? "")) ?? "");
  if (!id || !it.name) return [];
  const loc = it.location ?? {};
  const base = {
    title: String(it.name).trim(),
    description: excerpt(String(it.description ?? "")),
    locationName: loc.name ?? loc.contextualName ?? null,
    address: it.address ?? loc.streetAddress ?? null,
    lat: typeof loc.latitude === "number" ? loc.latitude : null,
    lon: typeof loc.longitude === "number" ? loc.longitude : null,
    ticketUrl: it.ticketsInfo?.buyUrl ?? null,
    imageUrl: it.imageUrl ?? null,
    organizerName: it.organizators?.[0]?.name ?? null,
    cancelled: it.isCanceled === true,
    raw: it,
  };
  const occurrences: { id: string; start: unknown; end: unknown }[] =
    Array.isArray(it.childEvents) && it.childEvents.length > 0
      ? it.childEvents.map((c: Record<string, any>) => ({ id: String(c.id ?? ""), start: c.utcStartDate, end: c.utcEndDate }))
      : [{ id, start: it.utcStartDate, end: it.utcEndDate }];
  const out: EventCandidate[] = [];
  for (const o of occurrences) {
    const start = o.start ? new Date(String(o.start)) : null;
    if (!o.id || !start || Number.isNaN(start.getTime())) continue;
    const end = o.end ? new Date(String(o.end)) : null;
    out.push({
      ...base,
      externalId: o.id,
      start,
      end: end && !Number.isNaN(end.getTime()) && end > start ? end : null,
      url: facebookEventUrl(o.id),
    });
  }
  return out;
}

async function apify(pageUrl: string, maxEvents: number): Promise<EventCandidate[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?format=json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startUrls: [{ url: pageEventsUrl(pageUrl, "events") }] /* the actor rejects upcoming_hosted_events */, maxEvents }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = (await res.json()) as Record<string, any>[];
  // The actor reports problems (e.g. a Page without an events tab) as dataset items with `error`.
  const failed = items.find((it) => it.error);
  if (failed && items.every((it) => it.error)) {
    throw new Error(`Apify: ${failed.error}: ${failed.errorDescription ?? ""}`.trim());
  }
  return items.filter((it) => !it.error).flatMap(apifyToCandidates);
}

/** FB_PAGE source: sources.url is the Page URL (https://www.facebook.com/<handle>). */
export const facebookPageAdapter: Adapter = async (source) => {
  if (!source.url) throw new Error("FB_PAGE source has no URL");
  const provider = source.config.provider ?? "auto";
  const maxEvents = source.config.maxEvents ?? APIFY_MAX_EVENTS;
  if (provider === "apify") return { candidates: await apify(source.url, maxEvents), complete: false };

  const r = await direct(source.url);
  if (r.blocked) {
    if (provider === "auto" && process.env.APIFY_TOKEN) {
      return { candidates: await apify(source.url, maxEvents), complete: false, warnings: ["direct fetch blocked; used Apify"] };
    }
    throw new Error("Facebook did not return the events list (login wall). Set APIFY_TOKEN to use the Apify fallback.");
  }
  // Logged-out pages show only the first few events, so absence isn't proof of removal;
  // known events are re-checked individually instead (see refreshFacebookEvents in run.ts).
  return { candidates: r.candidates, complete: false, warnings: r.warnings };
};
