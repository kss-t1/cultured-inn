// Display formatting in the UI locale, always in Europe/Warsaw regardless of the viewer's zone.
import { t } from "./i18n/index.ts";

const TZ = "Europe/Warsaw";

const timeFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat(t.locale, { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const money = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 });

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtShortDay = (iso: string) => shortDayFmt.format(new Date(iso));
export const fmtFull = (iso: string) => fullFmt.format(new Date(iso));
/** Local calendar date (YYYY-MM-DD) in Europe/Warsaw. */
export const localDateKey = (d: Date | string) => keyFmt.format(new Date(d));

/** "19:00–22:00" on one day, otherwise "Fri 5 Nov 19:00 – Sun 7 Nov 16:00" (localized). */
export function fmtRange(start: string, end: string | null): string {
  if (!end) return fmtTime(start);
  if (localDateKey(start) === localDateKey(end)) return `${fmtTime(start)}–${fmtTime(end)}`;
  return `${fmtShortDay(start)} ${fmtTime(start)} – ${fmtShortDay(end)} ${fmtTime(end)}`;
}

/** End part only, for "Saturday 5 November 2026, 19:00 – 22:00". */
export function fmtEnd(start: string, end: string): string {
  return localDateKey(start) === localDateKey(end) ? fmtTime(end) : `${fmtShortDay(end)} ${fmtTime(end)}`;
}

export function fmtPrice(e: { is_free: boolean; price_min: number | null; price_max: number | null; currency: string }): string | null {
  if (e.is_free) return t.event.free;
  const cur = e.currency === "PLN" ? t.event.currencyPLN : e.currency;
  if (e.price_min !== null && e.price_max !== null && e.price_max !== e.price_min)
    return `${money.format(e.price_min)}–${money.format(e.price_max)} ${cur}`;
  const p = e.price_min ?? e.price_max;
  return p === null ? null : `${money.format(p)} ${cur}`;
}
