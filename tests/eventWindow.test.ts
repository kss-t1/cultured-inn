// event_window(): local-time date windows, including DST transitions in Europe/Warsaw.
// 2026-10-25 03:00 CEST -> 02:00 CET (25-hour day); 2027-03-28 02:00 CET -> 03:00 CEST (23-hour day).
import { describe, expect, test } from "bun:test";
import { sql, TZ } from "../src/db.ts";

async function win(kind: string, nowIso: string, from?: string, to?: string) {
  const [r] = await sql`
    SELECT range_start, range_end FROM event_window(${kind}, ${nowIso}::timestamptz, ${TZ},
                                                    ${from ?? null}::date, ${to ?? null}::date)`;
  return { start: (r.range_start as Date).toISOString(), end: (r.range_end as Date).toISOString() };
}

describe("event_window", () => {
  test("today: now until local midnight", async () => {
    // 2026-11-03 14:00 CET = 13:00Z; midnight CET = 23:00Z
    expect(await win("today", "2026-11-03T13:00:00Z")).toEqual({
      start: "2026-11-03T13:00:00.000Z", end: "2026-11-03T23:00:00.000Z",
    });
  });

  test("today just after local midnight is still the new local day", async () => {
    // 00:30 CET on Nov 4 is 23:30Z on Nov 3
    expect(await win("today", "2026-11-03T23:30:00Z")).toEqual({
      start: "2026-11-03T23:30:00.000Z", end: "2026-11-04T23:00:00.000Z",
    });
  });

  test("tomorrow in summer time", async () => {
    expect(await win("tomorrow", "2026-07-10T10:00:00Z")).toEqual({
      start: "2026-07-10T22:00:00.000Z", end: "2026-07-11T22:00:00.000Z",
    });
  });

  test("weekend across autumn DST: Fri 17:00 CEST -> Mon 00:00 CET", async () => {
    expect(await win("weekend", "2026-10-21T08:00:00Z")).toEqual({
      start: "2026-10-23T15:00:00.000Z", end: "2026-10-25T23:00:00.000Z",
    });
  });

  test("weekend during the weekend starts now", async () => {
    expect(await win("weekend", "2026-10-24T12:00:00Z")).toEqual({
      start: "2026-10-24T12:00:00.000Z", end: "2026-10-25T23:00:00.000Z",
    });
  });

  test("week on a Sunday ends at local midnight", async () => {
    expect(await win("week", "2026-11-08T10:00:00Z")).toEqual({
      start: "2026-11-08T10:00:00.000Z", end: "2026-11-08T23:00:00.000Z",
    });
  });

  test("autumn DST day is 25 hours long", async () => {
    const w = await win("range", "2026-10-01T00:00:00Z", "2026-10-25");
    expect(w).toEqual({ start: "2026-10-24T22:00:00.000Z", end: "2026-10-25T23:00:00.000Z" });
  });

  test("spring DST day is 23 hours long", async () => {
    const w = await win("range", "2027-03-01T00:00:00Z", "2027-03-28");
    expect(w).toEqual({ start: "2027-03-27T23:00:00.000Z", end: "2027-03-28T22:00:00.000Z" });
  });

  test("multi-day range is inclusive of `to`", async () => {
    const w = await win("range", "2026-01-01T00:00:00Z", "2026-12-24", "2026-12-26");
    expect(w).toEqual({ start: "2026-12-23T23:00:00.000Z", end: "2026-12-26T23:00:00.000Z" });
  });

  test("unknown kind raises", async () => {
    expect(win("fortnight", "2026-01-01T00:00:00Z")).rejects.toThrow();
  });
});
