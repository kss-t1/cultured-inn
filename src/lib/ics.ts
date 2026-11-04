// Minimal RFC 5545 export (hand-written; parsing external ICS uses node-ical in M2).
import { localDateKey } from "../shared/format.ts";
import type { EventDetail } from "../shared/types.ts";

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  start: Date;
  end: Date | null;
  cancelled?: boolean;
  updated?: Date;
}

/** The calendar entry for one event page; `url` is the page's absolute address. */
export function toIcsEvent(e: EventDetail, url: string): IcsEvent {
  return {
    uid: `event-${e.id}@cultured-inn`,
    title: e.title,
    description: [e.description.slice(0, 1000), url].filter(Boolean).join("\n\n"),
    location: e.venue ? [e.venue.name, e.venue.address, "Poznań"].filter(Boolean).join(", ") : null,
    url,
    start: new Date(e.start_at),
    end: e.end_at ? new Date(e.end_at) : null,
    cancelled: e.status === "CANCELLED",
    updated: new Date(e.updated_at),
  };
}

const defaultEnd = (e: IcsEvent) => e.end ?? new Date(e.start.getTime() + 3 * 3600_000);

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** Folds content lines at 75 octets (UTF-8), never splitting a multi-byte character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + len > limit) {
      parts.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], calName = "Kulturalna Karczma"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kulturalna Karczma//cultured-inn//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  const now = new Date();
  for (const e of events) {
    const end = defaultEnd(e);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(e.updated ?? now)}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Google Calendar's "create event" link: on the web Google can't open a clicked .ics file.
 * An all-day event goes as Warsaw dates (end exclusive), anything else as UTC times.
 */
export function googleCalendarUrl(e: IcsEvent, allDay = false): string {
  const end = defaultEnd(e);
  const dates = allDay
    ? `${localDateKey(e.start).replace(/-/g, "")}/${localDateKey(end).replace(/-/g, "")}`
    : `${stamp(e.start)}/${stamp(end)}`;
  // The URL carries the whole description, so keep it short enough for any browser.
  const details = e.description && e.description.length > 600 ? `${e.description.slice(0, 500)}…\n\n${e.url ?? ""}` : e.description;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });
  if (details) q.set("details", details);
  if (e.location) q.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${q}`;
}
