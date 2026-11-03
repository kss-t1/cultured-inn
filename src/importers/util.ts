// Helpers shared by adapters: time zones, HTML to text, prices, polite HTTP.
import { TZ } from "../db.ts";

// ---------- time ----------

/** UTC offset (ms) of `tz` at instant `at`. */
function tzOffset(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` shows the given time. Times skipped in spring
 * move forward by the gap (like most calendars); in the autumn overlap either instant may win.
 */
export function zonedToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, tz = TZ): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - tzOffset(new Date(wall), tz);
  const second = wall - tzOffset(new Date(first), tz);
  if (first === second) return new Date(first);
  // Ambiguous or skipped: pick the candidate whose wall time matches, else the later one.
  const candidates = [Math.min(first, second), Math.max(first, second)];
  for (const c of candidates) if (c + tzOffset(new Date(c), tz) === wall) return new Date(c);
  return new Date(Math.max(first, second));
}

/** Wall-clock fields of `at` in `tz`. */
export function utcToZoned(at: Date, tz = TZ) {
  const w = new Date(at.getTime() + tzOffset(at, tz));
  return {
    y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(),
    h: w.getUTCHours(), mi: w.getUTCMinutes(), s: w.getUTCSeconds(),
  };
}

/** Parses "YYYY-MM-DD" and optional "HH:MM" as Warsaw wall-clock time. */
export function localToUtc(date: string, time?: string | null, tz = TZ): Date | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dm) return null;
  const tm = (time ?? "").match(/^(\d{1,2}):(\d{2})/);
  return zonedToUtc(+dm[1]!, +dm[2]!, +dm[3]!, tm ? +tm[1]! : 0, tm ? +tm[2]! : 0, 0, tz);
}

// ---------- text ----------

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", bdquo: "„", rdquo: "”", ldquo: "“", rsquo: "’", lsquo: "‘", oacute: "ó", Oacute: "Ó",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

/** HTML fragment to plain text with paragraph breaks; never returns markup. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Imported descriptions are excerpts: we link to the source instead of copying it whole. */
export function excerpt(text: string, max = 1500): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return (at > max * 0.6 ? cut.slice(0, at + 1) : cut).trimEnd() + " …";
}

// Polish source text: "wstęp wolny", "bezpłatn", "darmow".
const FREE_RE = /wst[eę]p (wolny|bezp[lł]atny)|bezp[lł]atn|za darmo|darmow|\bfree\b|wst[eę]p: ?0/i;
const PRICE_RE = /(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)(?!\p{L})/giu;

/** Best-effort price from free text. */
export function parsePrice(text: string): { isFree: boolean; priceMin: number | null; priceMax: number | null } {
  const prices = [...text.matchAll(PRICE_RE)].map((m) => Number(m[1]!.replace(",", "."))).filter((n) => n > 0 && n < 5000);
  if (prices.length) return { isFree: false, priceMin: Math.min(...prices), priceMax: Math.max(...prices) };
  return { isFree: FREE_RE.test(text), priceMin: null, priceMax: null };
}

// ---------- geography ----------

export const CITY_CENTER = { lat: 52.4064, lon: 16.9252 };
/** Poznań plus the ring of nearby towns people commute from. */
export const CITY_RADIUS_KM = 30;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * False when the location is clearly elsewhere: coordinates outside the radius, or a Polish
 * postcode outside the Poznań area (60-xxx to 62-xxx). Unknown locations count as local.
 */
export function isLocal(c: { lat?: number | null; lon?: number | null; address?: string | null; locationName?: string | null }): boolean {
  if (c.lat != null && c.lon != null) return distanceKm(CITY_CENTER, { lat: c.lat, lon: c.lon }) <= CITY_RADIUS_KM;
  const postcode = `${c.address ?? ""} ${c.locationName ?? ""}`.match(/\b(\d{2})-\d{3}\b/);
  if (postcode) return ["60", "61", "62"].includes(postcode[1]!);
  return true;
}

// ---------- HTTP ----------

export const BOT_UA = () => `KulturalnaKarczma/0.1 (+${process.env.PUBLIC_BASE_URL ?? "http://localhost"})`;
export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const lastHit = new Map<string, number>();
const hostQueue = new Map<string, Promise<unknown>>();

export class FetchError extends Error {
  constructor(public url: string, public status: number) {
    super(`HTTP ${status} for ${url}`);
  }
}

/**
 * fetch() with a per-host minimum interval (DESIGN.md: at most 1 request/second per host,
 * longer where robots.txt asks for it), a timeout, and an honest User-Agent by default.
 */
export function politeFetch(
  url: string,
  opts: { minIntervalMs?: number; headers?: Record<string, string>; timeoutMs?: number; method?: string; body?: string } = {},
): Promise<Response> {
  const host = new URL(url).host;
  const interval = opts.minIntervalMs ?? 1000;
  const run = (hostQueue.get(host) ?? Promise.resolve()).then(async () => {
    const wait = (lastHit.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await Bun.sleep(wait);
    lastHit.set(host, Date.now());
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      body: opts.body,
      headers: { "User-Agent": BOT_UA(), "Accept-Language": "pl,en;q=0.8", ...opts.headers },
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new FetchError(url, res.status);
    return res;
  });
  hostQueue.set(host, run.catch(() => {}));
  return run;
}
