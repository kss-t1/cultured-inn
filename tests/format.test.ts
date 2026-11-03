import { describe, expect, test } from "bun:test";
import { sql, TZ } from "../src/db.ts";
import { WHENS } from "../src/shared/filters.ts";
import { eventDays, fmtDays, isMultiday, localDateKey, windowDays } from "../src/shared/format.ts";

describe("windowDays", () => {
  // Tuesday evening, Friday night, Sunday, the last day of a month, and both DST changes.
  const nows = [
    "2026-11-03T19:30:00Z", "2026-11-06T22:30:00Z", "2026-11-08T10:00:00Z", "2026-11-30T22:30:00Z",
    "2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z",
  ];

  test("matches the local dates of event_window() in SQL", async () => {
    for (const iso of nows) {
      const now = new Date(iso);
      for (const when of WHENS) {
        const [w]: { range_start: Date; range_end: Date }[] =
          await sql`SELECT range_start, range_end FROM event_window(${when}, ${now}, ${TZ})`;
        const sqlDays: [string, string] = [localDateKey(w!.range_start), localDateKey(new Date(w!.range_end.getTime() - 1))];
        expect({ iso, when, days: windowDays({ when, from: null, to: null }, now) }).toEqual({ iso, when, days: sqlDays });
      }
    }
  });

  test("an Od–Do range wins over the quick window", () => {
    expect(windowDays({ when: "today", from: "2026-12-01", to: "2026-12-03" })).toEqual(["2026-12-01", "2026-12-03"]);
    expect(windowDays({ when: "today", from: "2026-12-01", to: null })).toEqual(["2026-12-01", "2026-12-01"]);
  });
});

describe("eventDays and isMultiday", () => {
  test("an end at local midnight doesn't count the next day", () => {
    // 20:00–00:00 Warsaw (CET, UTC+1)
    expect(eventDays({ start_at: "2026-11-05T19:00:00Z", end_at: "2026-11-05T23:00:00Z" })).toEqual(["2026-11-05", "2026-11-05"]);
  });

  test("a weekend convention covers every day and is multi-day", () => {
    const e = { start_at: "2026-11-06T17:00:00Z", end_at: "2026-11-08T20:00:00Z" };
    expect(eventDays(e)).toEqual(["2026-11-06", "2026-11-08"]);
    expect(isMultiday(e)).toBe(true);
  });

  test("an evening past midnight is not multi-day", () => {
    expect(isMultiday({ start_at: "2026-11-06T19:00:00Z", end_at: "2026-11-07T01:00:00Z" })).toBe(false);
    expect(isMultiday({ start_at: "2026-11-06T19:00:00Z", end_at: null })).toBe(false);
  });
});

test("fmtDays labels a day, a range in one month and across months", () => {
  expect(fmtDays(["2026-11-03", "2026-11-03"])).toBe("wtorek, 3 listopada");
  expect(fmtDays(["2026-11-03", "2026-11-30"])).toBe("3–30 listopada");
  expect(fmtDays(["2026-11-28", "2026-12-04"])).toBe("28 listopada – 4 grudnia");
});
