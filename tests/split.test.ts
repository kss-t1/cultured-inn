// Splitting one imported item into dated sessions, from its description, and storing them.
import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db.ts";
import { processCandidates } from "../src/importers/pipeline.ts";
import { flagGone, knownUpcoming, loadSource } from "../src/importers/run.ts";
import { parseDateLine, splitSessions } from "../src/importers/split.ts";
import type { EventCandidate, SourceRow } from "../src/importers/types.ts";
import { resetDb } from "./helpers.ts";

// poznan.pl item 188550, as htmlToText leaves it (shortened).
const CYCLE_DESCRIPTION = [
  "Zapraszamy na cykl bezpłatnych spotkań integracyjnych, podczas których odkryjemy świat gier planszowych i fabularnych RPG (TTRPG).",
  "",
  "Czekają na Was dwie sesje fabularne oraz dwa spotkania z planszówkami pełne współpracy!",
  "",
  "28 października i 4 listopada, g. 17:00",
  "RPG - będziecie wprowadzenie do tematu - omówienie czym są rpg, przebieg typowej sesji oraz sama sesja z uczestnikami.",
  "",
  "7 i 21 listopada, g. 15:00",
  "Otwarte spotkania integracyjne z grami planszowymi. Głównie kooperacyjne (pandemic, betrayal).",
  "",
  "Wydarzenia są nieodpłatne, obowiązują zapisy przez formularz.",
].join("\n");

const cycle = (o: Partial<EventCandidate> = {}): EventCandidate => ({
  externalId: "188550@2026-10-28",
  title: "Otwarte warsztaty/Poznajmy się - integracje przy grach kooperacyjnych i RPG",
  description: CYCLE_DESCRIPTION,
  start: new Date("2026-10-28T16:00:00Z"), // 17:00 Warsaw, after the 25 October DST change
  end: new Date("2026-11-21T17:00:00Z"),
  locationName: "Pracownia Ekonomii Społecznej Ładne Rzeczy, ul. Święty Marcin 57",
  raw: {},
  ...o,
});

describe("parseDateLine", () => {
  test("days grouped by month, then the time", () => {
    expect(parseDateLine("28 października i 4 listopada, g. 17:00")).toMatchObject({
      dates: [{ mo: 10, d: 28 }, { mo: 11, d: 4 }], h: 17, mi: 0,
    });
    expect(parseDateLine("7 i 21 listopada, g. 15:00")?.dates).toEqual([{ mo: 11, d: 7 }, { mo: 11, d: 21 }]);
    expect(parseDateLine("28 października 2026 r., godz. 17:00")?.dates).toEqual([{ mo: 10, d: 28 }]);
    expect(parseDateLine("środa 3, 10 oraz 17 grudnia godz. 18.30 – sesja RPG")).toEqual({
      dates: [{ mo: 12, d: 3 }, { mo: 12, d: 10 }, { mo: 12, d: 17 }], h: 18, mi: 30, end: null, rest: "sesja RPG",
    });
    expect(parseDateLine("5 i 6 grudnia, 16:00–22:00, festiwal")).toMatchObject({ h: 16, end: { h: 22, mi: 0 }, rest: "festiwal" });
    expect(parseDateLine("5 i 6 grudnia, 22:00–02:00")?.end).toBeNull(); // past midnight: left unknown
  });

  test("anything else is not a date line", () => {
    for (const line of [
      "Spotykamy się 28 października o 17:00 w klubie", // prose before the dates
      "7-9 listopada, g. 10:00", // a range is one multi-day event, not sessions
      "7 – 9 listopada, g. 10:00",
      "28, g. 17:00", // a day without a month
      "Start 17:00",
      "28 października i 4 listopada",
    ]) expect(parseDateLine(line)).toBeNull();
  });
});

describe("splitSessions", () => {
  test("a cycle of four meetings becomes four sessions with their own time and text", () => {
    const parts = splitSessions(cycle());
    expect(parts.map((p) => [p.externalId, p.start.toISOString(), p.end])).toEqual([
      ["188550@2026-10-28#2026-10-28", "2026-10-28T16:00:00.000Z", null],
      ["188550@2026-10-28#2026-11-04", "2026-11-04T16:00:00.000Z", null],
      ["188550@2026-10-28#2026-11-07", "2026-11-07T14:00:00.000Z", null],
      ["188550@2026-10-28#2026-11-21", "2026-11-21T14:00:00.000Z", null],
    ]);
    expect(parts.every((p) => p.splitFrom === "188550@2026-10-28" && p.title === cycle().title)).toBe(true);
    expect(parts[0]!.sessionText).toStartWith("RPG - ");
    expect(parts[2]!.sessionText).toStartWith("Otwarte spotkania integracyjne z grami planszowymi");
    expect(parts[2]!.sessionText).not.toContain("nieodpłatne"); // stops at the blank line
  });

  test("a time range gives each session its end", () => {
    const parts = splitSessions(cycle({ description: "28 października i 4 listopada, g. 17:00-20:30\nSesja RPG" }));
    expect(parts.map((p) => p.end?.toISOString())).toEqual(["2026-10-28T19:30:00.000Z", "2026-11-04T19:30:00.000Z"]);
  });

  test("a session before the October DST change keeps its wall-clock time", () => {
    const parts = splitSessions(cycle({
      start: new Date("2026-10-21T15:00:00Z"),
      description: "21 i 28 października, g. 17:00\nSesja RPG",
    }));
    expect(parts.map((p) => p.start.toISOString())).toEqual(["2026-10-21T15:00:00.000Z", "2026-10-28T16:00:00.000Z"]);
  });

  test("dates continue into January of the next year", () => {
    const parts = splitSessions(cycle({
      start: new Date("2026-12-17T17:00:00Z"), end: new Date("2027-01-14T20:00:00Z"),
      description: "17 grudnia i 14 stycznia, g. 18:00\nSesja RPG",
    }));
    expect(parts.map((p) => p.externalId.split("#")[1])).toEqual(["2026-12-17", "2027-01-14"]);
  });

  test("left whole: one day, one session, dates outside its range, or no end", () => {
    const whole = (o: Partial<EventCandidate>) => expect(splitSessions(cycle(o))).toEqual([cycle(o)]);
    whole({ end: new Date("2026-10-28T19:00:00Z") });
    whole({ description: "28 października, g. 17:00\nSesja RPG" });
    whole({ description: "28 października i 5 grudnia, g. 17:00\nSesja RPG" });
    whole({ end: null });
    whole({ description: "Konwent od piątku do niedzieli." });
    whole({ end: new Date("2026-12-05T17:00:00Z"), description: "4 i 31 listopada, g. 17:00\nSesja RPG" }); // no 31 November
  });
});

describe("processCandidates with a split item", () => {
  let source: SourceRow;
  const now = new Date("2026-10-20T10:00:00Z");
  const run = (c: EventCandidate, at = now) => processCandidates(source, { candidates: [c], complete: true }, { now: at });
  type Row = { id: number; category: string; start_at: Date; status: string; review_flags: string[]; import_locked: boolean };
  const events = async () =>
    (await sql`SELECT id, category, start_at, status, review_flags, import_locked FROM events ORDER BY start_at, id`) as Row[];

  beforeEach(async () => {
    await resetDb();
    const [row] = await sql`
      INSERT INTO sources (key, name, kind, trust, default_category, config)
      VALUES ('poznan-test', 'poznan.pl', 'HTML_ADAPTER', 'AUTO_PUBLISH', NULL,
              '{"matchOn": ["title"], "requireMatch": true}'::jsonb) RETURNING id`; // as the real poznan.pl source
    source = (await loadSource(row.id))!;
  });

  test("creates one event per session, each in its own category, and is idempotent", async () => {
    const { stats, eventIds } = await run(cycle());
    expect(stats.created).toBe(4);
    const rows = await events();
    expect(rows.map((e) => [e.start_at.toISOString(), e.category, e.status])).toEqual([
      ["2026-10-28T16:00:00.000Z", "RPG", "PUBLISHED"],
      ["2026-11-04T16:00:00.000Z", "RPG", "PUBLISHED"],
      ["2026-11-07T14:00:00.000Z", "BOARDGAMES", "PUBLISHED"],
      ["2026-11-21T14:00:00.000Z", "BOARDGAMES", "PUBLISHED"],
    ]);
    expect(eventIds.get("188550@2026-10-28")).toBe(rows[0]!.id); // a URL import finds the first session
    const again = await run(cycle());
    expect(again.stats).toMatchObject({ received: 1, created: 0, unchanged: 4, missing: 0 });
    expect(again.eventIds.get("188550@2026-10-28")).toBe(rows[0]!.id); // also when importing the same link again
  });

  test("refreshes see the split item once, by its own id, and a gone page flags all its sessions", async () => {
    // Far-future dates: knownUpcoming compares with the database clock.
    const far = cycle({ start: new Date("2036-10-28T16:00:00Z"), end: new Date("2036-11-21T17:00:00Z"), url: "https://example.org/cykl" });
    await run(far, new Date("2036-10-20T10:00:00Z"));
    expect(await knownUpcoming(source.id)).toEqual([{ external_id: "188550@2026-10-28", url: "https://example.org/cykl" }]);
    await flagGone(source.id, ["188550@2026-10-28"]);
    const flagged = await sql`SELECT count(*)::int AS n FROM events WHERE 'missing_from_source' = ANY(review_flags)`;
    expect(flagged[0].n).toBe(4);
  });

  test("the whole-cycle event imported before splitting existed is hidden, not left over the sessions", async () => {
    // Store the item the way it was imported before: one event from 28 October to 21 November.
    await run(cycle({ description: "Cykl spotkań z planszówkami." }));
    const [old] = await events();
    // Its text now lists the sessions.
    await run(cycle());
    const rows = await events();
    expect(rows.find((e) => e.id === old!.id)!.status).toBe("HIDDEN");
    expect(rows.filter((e) => e.status === "PUBLISHED")).toHaveLength(4);
    // Seen on every run, so a complete listing never flags it as missing.
    expect((await run(cycle())).stats.missing).toBe(0);
    // Retired once: an admin who publishes it again keeps it published.
    await sql`UPDATE events SET status = 'PUBLISHED' WHERE id = ${old!.id}`;
    await run(cycle());
    expect((await events()).find((e) => e.id === old!.id)!.status).toBe("PUBLISHED");
  });

  test("an admin-edited whole-cycle event stays, flagged for review", async () => {
    await run(cycle({ description: "Cykl spotkań z planszówkami." }));
    await sql`UPDATE events SET import_locked = true`;
    await run(cycle());
    const old = (await events()).find((e) => e.import_locked)!;
    expect(old.status).toBe("PUBLISHED");
    expect(old.review_flags).toContain("changed_at_source");
    // Flagged once: dismissing the flag sticks.
    await sql`UPDATE events SET review_flags = '{}' WHERE id = ${old.id}`;
    await run(cycle());
    expect((await events()).find((e) => e.id === old.id)!.review_flags).toEqual([]);
  });

  test("an item whose event an admin deleted doesn't come back as sessions, unless imported by hand", async () => {
    await run(cycle({ description: "Cykl spotkań z planszówkami." }));
    await sql`DELETE FROM events`;
    for (let i = 0; i < 2; i++) expect((await run(cycle())).stats).toMatchObject({ created: 0, skipped: { rejected: 4 } });
    const manual = await processCandidates(source, { candidates: [cycle()], complete: false }, { now, manual: true });
    expect(manual.stats.created).toBe(4);
  });

  test("a session's text picks the category but can't keep an item its title wouldn't", async () => {
    const { stats } = await run(cycle({ title: "Otwarte warsztaty w Pracowni" }));
    expect(stats).toMatchObject({ created: 0, skipped: { no_match: 4 } });
  });

  test("a URL import of a cycle already under way opens its first upcoming session", async () => {
    const { eventIds } = await processCandidates(source, { candidates: [cycle()], complete: false },
      { now: new Date("2026-11-05T10:00:00Z"), manual: true });
    const nov7 = (await events()).find((e) => e.start_at.toISOString() === "2026-11-07T14:00:00.000Z")!;
    expect(eventIds.get("188550@2026-10-28")).toBe(nov7.id);
  });

  test("past sessions are skipped like any past event", async () => {
    const { stats } = await run(cycle(), new Date("2026-11-05T10:00:00Z"));
    expect(stats).toMatchObject({ created: 2, skipped: { past: 2 } });
  });
});
