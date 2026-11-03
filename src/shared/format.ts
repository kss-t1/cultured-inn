// Display formatting in the UI locale, always in Europe/Warsaw regardless of the viewer's zone.
import type { Filters } from "./filters.ts";
import { t } from "./i18n/index.ts";

const TZ = "Europe/Warsaw";

const timeFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const longDateFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dateFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const money = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 });

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtShortDay = (iso: string) => shortDayFmt.format(new Date(iso));
/** "sobota, 7 listopada 2026" */
export const fmtLongDate = (iso: string) => longDateFmt.format(new Date(iso));
/** "2 lis 2026" */
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
/** Local calendar date (YYYY-MM-DD) in Europe/Warsaw. */
export const localDateKey = (d: Date | string) => keyFmt.format(new Date(d));

/** "19:00–22:00" on one day, otherwise "Fri 5 Nov 19:00 – Sun 7 Nov 16:00" (localized). */
export function fmtRange(start: string, end: string | null): string {
  if (!end) return fmtTime(start);
  if (localDateKey(start) === localDateKey(end)) return `${fmtTime(start)}–${fmtTime(end)}`;
  return `${fmtShortDay(start)} ${fmtTime(start)} – ${fmtShortDay(end)} ${fmtTime(end)}`;
}

export function fmtPrice(e: { is_free: boolean; price_min: number | null; price_max: number | null; currency: string }): string | null {
  if (e.is_free) return t.event.free;
  const cur = e.currency === "PLN" ? t.event.currencyPLN : e.currency;
  if (e.price_min !== null && e.price_max !== null && e.price_max !== e.price_min)
    return `${money.format(e.price_min)}–${money.format(e.price_max)} ${cur}`;
  const p = e.price_min ?? e.price_max;
  return p === null ? null : `${money.format(p)} ${cur}`;
}

/** Multi-day, as the "Wielodniowe" filter defines it (events.ts): 20 hours or longer. */
export const isMultiday = (e: { start_at: string; end_at: string | null }) =>
  e.end_at !== null && Date.parse(e.end_at) - Date.parse(e.start_at) >= 20 * 3600_000;

/** Local dates an event covers, first to last; an end at midnight doesn't count that day. */
export function eventDays(e: { start_at: string; end_at: string | null }): [string, string] {
  const first = localDateKey(e.start_at);
  if (!e.end_at) return [first, first];
  const last = localDateKey(new Date(Date.parse(e.end_at) - 1));
  return [first, last > first ? last : first];
}

/** Number of local dates an event covers (2 for Fri 20:00 – Sat 02:00). */
export function dayCount(e: { start_at: string; end_at: string | null }): number {
  const [first, last] = eventDays(e);
  return Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
}

/**
 * Shown as spanning days (day count on the card, a bar in the calendar): long and covering more
 * than one date. An all-day event (00:00 to 00:00 the next day) is long but covers one date.
 */
export const spansDays = (e: { start_at: string; end_at: string | null }) => isMultiday(e) && dayCount(e) > 1;

/** Starts and ends at local midnight on a single date: an ICS all-day event. */
export const isAllDay = (e: { start_at: string; end_at: string | null }) =>
  e.end_at !== null && fmtTime(e.start_at) === "00:00" && fmtTime(e.end_at) === "00:00" && dayCount(e) === 1;

// Date keys (YYYY-MM-DD) as UTC midnights: calendar arithmetic without time-zone shifts.
const keyDate = (k: string) => new Date(k + "T00:00:00Z");
const keyMonthFmt = new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", month: "long", year: "numeric" });
const keyDayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const keyRangeFmt = new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", day: "numeric", month: "long" });
const keyWeekdayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", weekday: "short" });

export function addDays(k: string, n: number): string {
  const d = keyDate(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (k: string) => (keyDate(k).getUTCDay() + 6) % 7;
/** Last day of the key's month. */
export function monthEnd(k: string): string {
  const d = keyDate(k);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
/** "listopad 2026" */
export const fmtMonth = (k: string) => keyMonthFmt.format(keyDate(k));
/** "pon." */
export const fmtWeekdayShort = (k: string) => keyWeekdayFmt.format(keyDate(k));

/** Local dates [first, last] of the filter window; mirrors event_window() in SQL. */
export function windowDays(f: Pick<Filters, "when" | "from" | "to">, now = new Date()): [string, string] {
  if (f.from) return [f.from, f.to ?? f.from];
  const today = localDateKey(now);
  const sunday = addDays(today, 6 - weekdayIndex(today));
  switch (f.when) {
    case "today": return [today, today];
    case "tomorrow": return [addDays(today, 1), addDays(today, 1)];
    case "weekend": {
      const friday = addDays(sunday, -2);
      return [friday > today ? friday : today, sunday];
    }
    case "week": return [today, sunday];
    case "month": return [today, monthEnd(today)];
  }
}

/** "wtorek, 3 listopada", "3–30 listopada" or "28 listopada – 4 grudnia". */
export function fmtDays([first, last]: [string, string]): string {
  return first === last ? keyDayFmt.format(keyDate(first)) : keyRangeFmt.formatRange(keyDate(first), keyDate(last));
}
