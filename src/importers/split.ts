// Splits one imported item that really announces several dated sessions into one candidate per
// session, based on date lines in its description:
//   "28 października i 4 listopada, g. 17:00" + "RPG - wprowadzenie…"
//   "7 i 21 listopada, g. 15:00" + "Otwarte spotkania z grami planszowymi…"
import { TZ } from "../db.ts";
import type { EventCandidate } from "./types.ts";
import { utcToZoned, zonedToUtc } from "./util.ts";

// Polish genitive month names, as written after a day number. Matched against lowercased text.
const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września",
  "października", "listopada", "grudnia"];
// Weekday names and joining words that may appear among the dates ("środa 28 października i …").
const FILLER = new Set(["i", "oraz", "&", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"]);
const TIME = /\b(?:g|godz|godzina)?\.?\s*(\d{1,2})[:.](\d{2})\b/;

interface DateLine { dates: { mo: number; d: number }[]; h: number; mi: number; rest: string }

/** "28 października i 4 listopada, g. 17:00 …" → its dates and time; null for any other line. */
export function parseDateLine(line: string): DateLine | null {
  const lower = line.toLowerCase();
  const tm = TIME.exec(lower);
  if (!tm) return null;
  const h = +tm[1]!, mi = +tm[2]!;
  if (h > 23 || mi > 59) return null;
  const tokens = lower.slice(0, tm.index).replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
  const dates: { mo: number; d: number }[] = [];
  let days: number[] = [];
  for (const tok of tokens) {
    if (/^\d{1,2}$/.test(tok)) days.push(+tok);
    else if (MONTHS.includes(tok)) {
      if (days.length === 0) return null;
      dates.push(...days.map((d) => ({ mo: MONTHS.indexOf(tok) + 1, d })));
      days = [];
    } else if (!FILLER.has(tok) && !/^[-–]$/.test(tok)) return null;
  }
  if (days.length > 0 || dates.length === 0) return null;
  return { dates, h, mi, rest: line.slice(tm.index + tm[0].length).replace(/^[\s,.–-]+/, "") };
}

const dateKey = (y: number, mo: number, d: number) =>
  `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * One candidate per session when a multi-day item lists at least two dated sessions inside its own
 * date range; otherwise the item unchanged. Sessions keep the item's text and get `sessionText`
 * (the paragraph under their date line) for classification, so an RPG session and a board-game
 * session of the same cycle land in different categories.
 */
export function splitSessions(c: EventCandidate): EventCandidate[] {
  if (!c.end) return [c];
  const from = utcToZoned(c.start, TZ), to = utcToZoned(c.end, TZ);
  const first = dateKey(from.y, from.mo, from.d), last = dateKey(to.y, to.mo, to.d);
  if (first === last) return [c];

  const lines = c.description.split("\n").map((l) => l.trim());
  const sessions: { key: string; start: Date; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const dl = parseDateLine(lines[i]!);
    if (!dl) continue;
    // The session's own text: the rest of the date line and the lines under it, up to a blank line.
    const text = [dl.rest];
    for (let j = i + 1; j < lines.length && lines[j] && !parseDateLine(lines[j]!); j++) text.push(lines[j]!);
    for (const { mo, d } of dl.dates) {
      const y = mo < from.mo ? from.y + 1 : from.y;
      const key = dateKey(y, mo, d);
      if (key < first || key > last) return [c]; // a date outside the item's range: not its schedule
      sessions.push({ key, start: zonedToUtc(y, mo, d, dl.h, dl.mi, 0, TZ), text: text.join("\n").trim() });
    }
  }
  if (new Set(sessions.map((s) => s.key)).size !== sessions.length || sessions.length < 2) return [c];

  return sessions
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((s) => ({
      ...c,
      externalId: `${c.externalId}#${s.key}`,
      start: s.start,
      end: null,
      allDay: false,
      splitFrom: c.externalId,
      sessionText: s.text,
    }));
}
