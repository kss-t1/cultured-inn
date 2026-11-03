// Generic schema.org Event adapter: reads <script type="application/ld+json"> blocks.
// Covers ticketing sites (Biletyna, ebilet), Meetup, Eventbrite and many WordPress sites.
import type { Adapter, EventCandidate } from "../types.ts";
import { decodeEntities, excerpt, htmlToText, localToUtc, politeFetch } from "../util.ts";

const EVENT_TYPE = /Event$/; // Event, TheaterEvent, ComedyEvent, SocialEvent, ...

function types(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

/** Every schema.org Event object in the page, wherever it is nested (@graph, ItemList, events[]). */
export function extractJsonLdEvents(html: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (types(o).some((t) => EVENT_TYPE.test(t)) && o.startDate) {
      out.push(o);
      return; // sub-events are rare and usually duplicates of the parent's schedule
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]!.trim()), 0);
    } catch {
      // Malformed blocks are common; skip them.
    }
  }
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Maps one schema.org Event to a candidate. Dates must carry an offset or be date-only. */
export function jsonLdToCandidate(o: Record<string, any>, pageUrl: string): EventCandidate | null {
  const start = parseDate(o.startDate);
  if (!start || !str(o.name)) return null;
  const end = parseDate(o.endDate);
  const loc = Array.isArray(o.location) ? o.location[0] : o.location;
  const addr = loc?.address;
  const address = typeof addr === "string"
    ? addr
    : addr ? [addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean).join(", ") : null;
  const geo = loc?.geo ?? loc;
  const offers = Array.isArray(o.offers) ? o.offers : o.offers ? [o.offers] : [];
  const prices = offers.flatMap((of: any) => [num(of.lowPrice), num(of.price), num(of.highPrice)]).filter((n: number | null): n is number => n !== null);
  const url = str(o.url)?.replace(/#.*$/, "") ?? pageUrl;
  const image = Array.isArray(o.image) ? o.image[0] : o.image;
  const description = str(o.description) ?? "";
  return {
    externalId: str(o["@id"]) ?? url + (url === pageUrl ? `#${start.date.toISOString()}` : ""),
    title: decodeEntities(str(o.name)!).replace(/^"(.*)"$/, "$1"),
    description: excerpt(/<[a-z]/i.test(description) ? htmlToText(description) : decodeEntities(description)),
    start: start.date,
    end: end && end.date > start.date ? end.date : null,
    allDay: start.allDay,
    locationName: str(loc?.name)?.trim() ?? null,
    address: address?.trim() || null,
    lat: num(geo?.latitude),
    lon: num(geo?.longitude),
    url,
    ticketUrl: str(offers[0]?.url)?.replace(/#.*$/, "") ?? null,
    imageUrl: typeof image === "string" ? image : str(image?.url),
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    isFree: o.isAccessibleForFree === true || (prices.length > 0 && Math.max(...prices) === 0),
    organizerName: str((Array.isArray(o.organizer) ? o.organizer[0] : o.organizer)?.name),
    cancelled: /Cancelled/i.test(String(o.eventStatus ?? "")),
    raw: o,
  };
}

function parseDate(v: unknown): { date: Date; allDay: boolean } | null {
  if (typeof v !== "string") return null;
  // Date-only, or a time without an offset: local to the event, which for our sources is Warsaw.
  const local = v.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (local) {
    const date = localToUtc(local[1]!, local[2]);
    return date ? { date, allDay: !local[2] } : null;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : { date: d, allDay: false };
}

export const jsonLdAdapter: Adapter = async (source) => {
  const urls = source.config.urls?.length ? source.config.urls : source.url ? [source.url] : [];
  if (!urls.length) throw new Error("JSONLD source has no URL");
  const candidates: EventCandidate[] = [];
  const warnings: string[] = [];
  for (const url of urls) {
    try {
      const html = await (await politeFetch(url, { minIntervalMs: 2000 })).text();
      for (const o of extractJsonLdEvents(html)) {
        const c = jsonLdToCandidate(o, url);
        if (c) candidates.push(c);
      }
    } catch (e) {
      warnings.push(`${url}: ${(e as Error).message}`);
    }
  }
  if (warnings.length === urls.length) throw new Error(warnings.join("; "));
  // Listing pages are paginated and only show what's on sale, so absence proves nothing.
  return { candidates, complete: false, warnings };
};
