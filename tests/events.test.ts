import { beforeEach, describe, expect, test } from "bun:test";
import { queryEvents, toPrefixQuery } from "../src/lib/events.ts";
import { DEFAULT_FILTERS, type Filters } from "../src/shared/filters.ts";
import { addEvent, addVenue, resetDb, warsaw } from "./helpers.ts";

const f = (patch: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, cats: [], tags: [], ...patch });
const titles = (evs: { title: string }[]) => evs.map((e) => e.title);

beforeEach(resetDb);

describe("queryEvents", () => {
  test("today: published only, includes ongoing, excludes finished and tomorrow", async () => {
    await addEvent({ title: "ongoing", start: "2026-11-03 12:00", end: "2026-11-03 16:00" });
    await addEvent({ title: "finished", start: "2026-11-03 09:00", end: "2026-11-03 11:00" });
    await addEvent({ title: "tonight", start: "2026-11-03 19:00" });
    await addEvent({ title: "draft", start: "2026-11-03 19:00", status: "DRAFT" });
    await addEvent({ title: "tomorrow", start: "2026-11-04 10:00" });
    const now = await warsaw("2026-11-03 14:00");
    expect(titles(await queryEvents(f({ when: "today" }), { now }))).toEqual(["ongoing", "tonight"]);
  });

  test("evening filter uses Warsaw local time, not UTC", async () => {
    // 17:30 CET = 16:30Z; 16:30 CET = 15:30Z
    await addEvent({ title: "evening", start: "2026-11-05 17:30" });
    await addEvent({ title: "afternoon", start: "2026-11-05 16:30" });
    const now = await warsaw("2026-11-05 08:00");
    expect(titles(await queryEvents(f({ time: "evening" }), { now }))).toEqual(["evening"]);
    expect(titles(await queryEvents(f({ time: "day" }), { now }))).toEqual(["afternoon"]);
  });

  test("category, free, beginner, english, price and tag filters", async () => {
    await addEvent({ title: "rpg-free-en", start: "2026-11-05 18:00", category: "RPG", isFree: true, language: "both", tags: ["d&d"] });
    await addEvent({ title: "larp-paid", start: "2026-11-05 18:00", category: "LARP", priceMin: 80, beginner: true });
    await addEvent({ title: "impro-cheap", start: "2026-11-05 18:00", category: "IMPRO", priceMin: 25 });
    const now = await warsaw("2026-11-05 08:00");
    const q = (p: Partial<Filters>) => queryEvents(f(p), { now }).then(titles);
    expect((await q({ cats: ["RPG", "IMPRO"] })).sort()).toEqual(["impro-cheap", "rpg-free-en"]);
    expect(await q({ free: true })).toEqual(["rpg-free-en"]);
    expect(await q({ beginner: true })).toEqual(["larp-paid"]);
    expect(await q({ english: true })).toEqual(["rpg-free-en"]);
    expect((await q({ priceMax: 30 })).sort()).toEqual(["impro-cheap", "rpg-free-en"]);
    expect(await q({ tags: ["d&d"] })).toEqual(["rpg-free-en"]);
  });

  test("search ignores diacritics, matches prefixes, venue names and typos", async () => {
    const gosu = await addVenue("Gosu", 52.4, 16.93);
    await addEvent({ title: "Wieczór planszówkowy", start: "2026-11-05 18:00" });
    await addEvent({ title: "Sesja Zew Cthulhu", start: "2026-11-05 18:00", venueId: gosu, category: "RPG" });
    const now = await warsaw("2026-11-05 08:00");
    const q = (text: string) => queryEvents(f({ q: text }), { now }).then(titles);
    expect(await q("planszowk")).toEqual(["Wieczór planszówkowy"]);
    expect(await q("WIECZOR")).toEqual(["Wieczór planszówkowy"]);
    expect(await q("gosu")).toEqual(["Sesja Zew Cthulhu"]);
    expect(await q("zew")).toEqual(["Sesja Zew Cthulhu"]);
    expect(await q("cthulu")).toEqual(["Sesja Zew Cthulhu"]); // trigram typo tolerance
    expect(await q("'; DROP TABLE events; --")).toEqual([]);
  });

  test("bbox filters by venue coordinates", async () => {
    const inside = await addVenue("inside", 52.40, 16.93);
    const outside = await addVenue("outside", 52.20, 16.50);
    await addEvent({ title: "in", start: "2026-11-05 18:00", venueId: inside });
    await addEvent({ title: "out", start: "2026-11-05 18:00", venueId: outside });
    const now = await warsaw("2026-11-05 08:00");
    expect(titles(await queryEvents(f({ bbox: [16.8, 52.3, 17.1, 52.5] }), { now }))).toEqual(["in"]);
  });

  test("returns the public JSON shape with ISO timestamps", async () => {
    const v = await addVenue("Kosteczka", 52.404, 16.933);
    await addEvent({ title: "shape", start: "2026-11-05 18:00", venueId: v });
    const [e] = await queryEvents(f(), { now: await warsaw("2026-11-05 08:00") });
    expect(e).toMatchObject({
      title: "shape", category: "BOARDGAMES", start_at: "2026-11-05T17:00:00.000Z", end_at: null,
      venue: { name: "Kosteczka", lat: 52.404, lon: 16.933 }, organizer: null, is_recurring: false,
    });
  });
});

test("toPrefixQuery strips tsquery syntax", () => {
  expect(toPrefixQuery("plansz  gosu")).toBe("plansz:* & gosu:*");
  expect(toPrefixQuery("a&b | !c")).toBe("a:* & b:* & c:*");
  expect(toPrefixQuery("D&D")).toBe("D:* & D:*");
  expect(toPrefixQuery("  !!! ")).toBeNull();
});
