// Facebook events, without the Graph API (Meta closed public-event access in 2018).
//
// * Event pages (facebook.com/events/<id>) are readable logged-out. The page embeds the event as
//   JSON in <script type="application/json"> blocks: name, start/end timestamps, place, address,
//   description, cover image, host, is_canceled.
// * A Page's upcoming_hosted_events tab lists its events with ids. Many Pages show it logged-out;
//   for the others Facebook returns a login wall, and the tab is read with the session cookies of
//   a dedicated (throwaway) Facebook account in FB_COOKIES. Only that one request per Page uses
//   the login; event pages are always fetched logged-out, so the account makes a handful of
//   requests a day.
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
 */
export function pageEventsUrl(pageUrl: string): string {
  const tab = "upcoming_hosted_events";
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

/** The Facebook user a page was rendered for: "0" when logged out, null when the marker is missing. */
export function viewerId(html: string): string | null {
  return html.match(/"USER_ID":"(\d+)"/)?.[1] ?? null;
}

type PageFetcher = (url: string, cookie: string | null) => Promise<string>;

const fetchPageHtml: PageFetcher = async (url, cookie) => {
  const headers = cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS;
  return (await politeFetch(url, { headers, minIntervalMs: FB_INTERVAL_MS })).text();
};

/**
 * Event ids on a Page: logged-out first, then with the account's cookies if Facebook shows a
 * login wall. Errors say which of the two failed, so an expired login is easy to spot.
 */
export async function listPageEventIds(
  pageUrl: string,
  cookie: string | null,
  fetchPage: PageFetcher = fetchPageHtml,
): Promise<string[]> {
  const url = pageEventsUrl(pageUrl);
  const ids = parsePageEventIds(await fetchPage(url, null));
  if (ids) return ids;
  if (!cookie) throw new Error("Facebook shows a login wall for this Page's events. Set FB_COOKIES (README, Facebook).");
  const html = await fetchPage(url, cookie);
  const viaLogin = parsePageEventIds(html);
  if (viaLogin) return viaLogin;
  const viewer = viewerId(html);
  if (!viewer || viewer === "0") {
    throw new Error("FB_COOKIES no longer log in (expired, or the account needs a security check). Export fresh cookies.");
  }
  throw new Error("Logged in, but the events list wasn't found in the page (Facebook changed its markup?).");
}

/** FB_PAGE source: sources.url is the Page URL (facebook.com/<handle> or profile.php?id=<id>). */
export const facebookPageAdapter: Adapter = async (source) => {
  if (!source.url) throw new Error("FB_PAGE source has no URL");
  const ids = await listPageEventIds(source.url, process.env.FB_COOKIES?.trim() || null);
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
  // A Page's list may be partial, so absence isn't proof of removal; known events are re-checked
  // individually instead (withKnownFacebookEvents in run.ts).
  return { candidates, complete: false, warnings };
};
