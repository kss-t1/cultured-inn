// Generic iCalendar (RFC 5545) adapter: Google/Outlook/Meetup calendars, WordPress ?ical=1.
// Recurring events are expanded into single occurrences up to a horizon (default 60 days).
import { RRule } from "rrule";
import { TZ } from "../../db.ts";
import type { Adapter, EventCandidate } from "../types.ts";
import { decodeEntities, excerpt, htmlToText, politeFetch, utcToZoned, zonedToUtc } from "../util.ts";

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface VEvent {
  props: Map<string, Prop[]>;
}

/** Unfolds lines and splits the calendar into VEVENT property maps. */
export function parseIcs(text: string): VEvent[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: VEvent[] = [];
  let current: VEvent | null = null;
  let depth = 0; // nested components inside VEVENT (VALARM) are ignored
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { props: new Map() };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line === "END:VEVENT") {
      events.push(current);
      current = null;
      continue;
    }
    if (line.startsWith("BEGIN:")) depth++;
    else if (line.startsWith("END:")) depth--;
    else if (depth === 0) {
      const prop = parseLine(line);
      if (prop) {
        const list = current.props.get(prop.name) ?? [];
        list.push(prop);
        current.props.set(prop.name, list);
      }
    }
  }
  return events;
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=a;PARAM2="b:c":VALUE (the value starts at the first colon outside quotes)
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ":" && !inQuote) break;
  }
  if (i >= line.length) return null;
  const [name, ...rawParams] = line.slice(0, i).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name!.toUpperCase(), params, value: line.slice(i + 1) };
}

export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const first = (e: VEvent, name: string) => e.props.get(name)?.[0];
const text = (e: VEvent, name: string) => {
  const p = first(e, name);
  return p ? unescapeText(p.value).trim() : "";
};

/** Wall-clock time of a DATE or DATE-TIME value, plus how to turn it into an instant. */
interface IcsTime {
  y: number; mo: number; d: number; h: number; mi: number; s: number;
  /** "UTC", an IANA zone, or "floating" (interpreted in Europe/Warsaw). */
  zone: string;
  allDay: boolean;
}

export function parseIcsTime(p: Prop): IcsTime | null {
  const m = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const allDay = p.params.VALUE === "DATE" || m[4] === undefined;
  const zone = m[7] ? "UTC" : p.params.TZID ? normalizeTzid(p.params.TZID) : "floating";
  return { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0), zone, allDay };
}

/** Outlook-style ids ("Central European Standard Time") and unknown zones fall back to Warsaw. */
function normalizeTzid(tzid: string): string {
  const id = tzid.replace(/^\/.*?\/(?=[A-Z])/, ""); // "/mozilla.org/.../Europe/Warsaw"
  try {
    new Intl.DateTimeFormat("en", { timeZone: id });
    return id;
  } catch {
    return TZ;
  }
}

function toInstant(t: IcsTime): Date {
  if (t.zone === "UTC") return new Date(Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s));
  return zonedToUtc(t.y, t.mo, t.d, t.h, t.mi, t.s, t.zone === "floating" ? TZ : t.zone);
}

/** RRULE math runs on wall-clock times encoded as UTC dates, so DST never shifts occurrences. */
const wallAsUtc = (t: { y: number; mo: number; d: number; h: number; mi: number; s: number }) =>
  new Date(Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s));
const fromWallAsUtc = (w: Date, zone: string): IcsTime => ({
  y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(),
  h: w.getUTCHours(), mi: w.getUTCMinutes(), s: w.getUTCSeconds(), zone, allDay: false,
});

/** Same wall clock as `t`, expressed in the event's zone (for comparing EXDATE/RECURRENCE-ID). */
function wallKey(t: IcsTime, zone: string): number {
  if (t.zone === zone || t.allDay) return wallAsUtc(t).getTime();
  const inst = toInstant(t);
  return wallAsUtc(utcToZoned(inst, zone === "floating" ? TZ : zone === "UTC" ? "UTC" : zone)).getTime();
}

export interface ExpandOptions {
  from: Date;
  to: Date;
}

/**
 * Turns VEVENTs into occurrences between `from` and `to`. Overridden instances
 * (RECURRENCE-ID) replace the generated ones; EXDATEs are removed.
 */
export function expandEvents(vevents: VEvent[], { from, to }: ExpandOptions): EventCandidate[] {
  const out: EventCandidate[] = [];
  // Overrides keyed by UID, then by wall-clock key of their RECURRENCE-ID.
  const overrides = new Map<string, Set<number>>();
  for (const e of vevents) {
    const rid = first(e, "RECURRENCE-ID");
    if (!rid) continue;
    const t = parseIcsTime(rid);
    const start = first(e, "DTSTART");
    const zone = start ? (parseIcsTime(start)?.zone ?? "floating") : "floating";
    if (!t) continue;
    const uid = text(e, "UID");
    if (!overrides.has(uid)) overrides.set(uid, new Set());
    overrides.get(uid)!.add(wallKey(t, zone));
  }

  for (const e of vevents) {
    const dtstart = first(e, "DTSTART");
    if (!dtstart) continue;
    const start = parseIcsTime(dtstart);
    if (!start) continue;
    const uid = text(e, "UID") || `${text(e, "SUMMARY")}@${dtstart.value}`;
    const durationMs = eventDuration(e, start);
    const rrule = first(e, "RRULE");
    const rid = first(e, "RECURRENCE-ID");

    if (!rrule || rid) {
      const s = toInstant(start);
      const end = endOf(start, s, durationMs);
      if ((end ?? s) < from || s > to) continue;
      const ridTime = rid ? parseIcsTime(rid) : null;
      const occurrenceKey = ridTime ? `${uid}@${dateStamp(ridTime)}` : uid;
      out.push(toCandidate(e, occurrenceKey, s, end, start.allDay, rid ? uid : null, null));
      continue;
    }

    // Recurring master.
    const opts = RRule.parseString(rrule.value);
    if (opts.until) {
      // UNTIL is an instant (UTC) or a date; convert to the event's wall clock.
      opts.until = wallAsUtc(utcToZoned(opts.until, start.zone === "UTC" ? "UTC" : start.zone === "floating" ? TZ : start.zone));
    }
    const rule = new RRule({ ...opts, dtstart: wallAsUtc(start) });
    const zone = start.zone === "floating" ? TZ : start.zone === "UTC" ? "UTC" : start.zone;
    // Window in wall-clock terms, padded by a day for zone offsets and long events.
    const padded = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
    const fromWall = wallAsUtc(utcToZoned(padded(from, -1 - Math.ceil((durationMs ?? 0) / 86_400_000)), zone));
    const toWall = wallAsUtc(utcToZoned(padded(to, 1), zone));

    const excluded = new Set<number>();
    for (const ex of e.props.get("EXDATE") ?? []) {
      for (const v of ex.value.split(",")) {
        const t = parseIcsTime({ ...ex, value: v });
        if (t) excluded.add(t.allDay ? wallAsUtc({ ...t, h: start.h, mi: start.mi, s: start.s }).getTime() : wallKey(t, start.zone));
      }
    }
    const overridden = overrides.get(uid) ?? new Set();

    for (const w of rule.between(fromWall, toWall, true)) {
      const key = w.getTime();
      if (excluded.has(key) || overridden.has(key)) continue;
      const occ = fromWallAsUtc(w, start.zone);
      occ.allDay = start.allDay;
      const s = toInstant(occ);
      const end = endOf(occ, s, durationMs);
      if ((end ?? s) < from || s > to) continue;
      out.push(toCandidate(e, `${uid}@${dateStamp(occ)}`, s, end, start.allDay, uid, rrule.value));
    }
  }
  return out;
}

/** All-day durations are in calendar days, so they must not shift when DST changes mid-event. */
function endOf(t: IcsTime, start: Date, durationMs: number | null): Date | null {
  if (durationMs === null) return null;
  if (!t.allDay) return new Date(start.getTime() + durationMs);
  return toInstant({ ...fromWallAsUtc(new Date(wallAsUtc(t).getTime() + durationMs), t.zone), allDay: true });
}

/**
 * Occurrence key: the local (Warsaw) date of the original occurrence. Keyed by date rather than
 * time, so moving one week's session to another hour updates the event instead of duplicating it.
 */
function dateStamp(t: IcsTime): string {
  const d = t.allDay ? t : utcToZoned(toInstant(t), TZ);
  return `${d.y}${String(d.mo).padStart(2, "0")}${String(d.d).padStart(2, "0")}`;
}

function eventDuration(e: VEvent, start: IcsTime): number | null {
  const dtend = first(e, "DTEND");
  if (dtend) {
    const end = parseIcsTime(dtend);
    if (end) {
      if (start.allDay) return wallAsUtc(end).getTime() - wallAsUtc(start).getTime();
      return toInstant(end).getTime() - toInstant(start).getTime();
    }
  }
  const dur = first(e, "DURATION")?.value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (dur) {
    const [, w, d, h, m, s] = dur.map((x) => Number(x ?? 0));
    return ((((w! * 7 + d!) * 24 + h!) * 60 + m!) * 60 + s!) * 1000;
  }
  return start.allDay ? 86_400_000 : null;
}

function toCandidate(
  e: VEvent, externalId: string, start: Date, end: Date | null, allDay: boolean,
  seriesKey: string | null, seriesRule: string | null,
): EventCandidate {
  const rawDescription = text(e, "DESCRIPTION");
  // Google Calendar descriptions are often HTML.
  const description = /<[a-z][\s\S]*>/i.test(rawDescription) ? htmlToText(rawDescription) : decodeEntities(rawDescription);
  const url = text(e, "URL") || description.match(/https?:\/\/\S+/)?.[0].replace(/[).,;:!?\]]+$/, "") || null;
  const location = text(e, "LOCATION");
  const status = text(e, "STATUS").toUpperCase();
  const geo = text(e, "GEO").match(/^(-?[\d.]+)[;,](-?[\d.]+)$/);
  return {
    externalId,
    title: text(e, "SUMMARY"), // empty titles are dropped by the pipeline
    description: excerpt(description),
    start,
    end: end && end > start ? end : null,
    allDay,
    locationName: location || null,
    lat: geo ? Number(geo[1]) : null,
    lon: geo ? Number(geo[2]) : null,
    url,
    cancelled: status === "CANCELLED",
    seriesKey,
    seriesRule,
    classifyHint: (e.props.get("CATEGORIES") ?? []).map((p) => unescapeText(p.value)).join(" "),
    raw: Object.fromEntries([...e.props].map(([k, v]) => [k, v.map((p) => p.value).join(" | ")])),
  };
}

/** A public Google Calendar feed's web view, the link for events that carry none of their own. */
export function calendarPage(feedUrl: string): string | null {
  const id = feedUrl.match(/^https:\/\/calendar\.google\.com\/calendar\/ical\/([^/]+)\/public\//)?.[1];
  return id ? `https://calendar.google.com/calendar/embed?src=${id}&ctz=Europe%2FWarsaw` : null;
}

export const icsAdapter: Adapter = async (source) => {
  if (!source.url) throw new Error("ICS source has no URL");
  const res = await politeFetch(source.url, { headers: { Accept: "text/calendar, */*" } });
  const body = await res.text();
  if (!body.includes("BEGIN:VCALENDAR")) throw new Error("Response is not an iCalendar file");
  const now = new Date();
  const horizon = new Date(now.getTime() + (source.config.horizonDays ?? 60) * 86_400_000);
  // Include events that started up to 12 hours ago so ongoing ones keep updating.
  const from = new Date(now.getTime() - 12 * 3_600_000);
  const page = calendarPage(source.url);
  const candidates = expandEvents(parseIcs(body), { from, to: horizon }).map((c) => ({ ...c, url: c.url ?? page }));
  return { candidates, complete: true, horizon };
};
