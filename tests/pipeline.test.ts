// Import pipeline against the test database: classification, venue matching, dedupe, updates,
// admin locks, disappearance and publish policy.
import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db.ts";
import { decide, languageOf, matchVenue, processCandidates, priceOf } from "../src/importers/pipeline.ts";
import { loadSource } from "../src/importers/run.ts";
import type { EventCandidate, SourceRow } from "../src/importers/types.ts";
import { resetDb } from "./helpers.ts";

const DAY = 86_400_000;
const soon = (days: number, hour = 18) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour - 1, 0, 0, 0); // ~hour in Warsaw (winter); exact time doesn't matter here
  return d;
};

let venueId: number;

async function makeSource(o: Partial<{ key: string; kind: string; trust: string; category: string | null; config: object; venue: number | null }> = {}): Promise<SourceRow> {
  const [row] = await sql`
    INSERT INTO sources (key, name, kind, trust, default_category, default_venue_id, config)
    VALUES (${o.key ?? `src-${Math.random().toString(36).slice(2, 7)}`}, 'Test source', ${o.kind ?? "ICS"}::source_kind,
            ${o.trust ?? "REVIEW"}::source_trust, ${o.category === undefined ? "BOARDGAMES" : o.category}::category,
            ${o.venue ?? null}, ${o.config ?? {}}::jsonb)
    RETURNING id`;
  return (await loadSource(row.id))!;
}

const cand = (o: Partial<EventCandidate> = {}): EventCandidate => ({
  externalId: "ext-1",
  title: "Wieczór planszówkowy",
  description: "",
  start: soon(3),
  end: null,
  locationName: "Druga Era Klub Fantastyki, Słowackiego 13",
  raw: { test: true },
  ...o,
});

const run = (s: SourceRow, candidates: EventCandidate[], complete = false) =>
  processCandidates(s, { candidates, complete, horizon: new Date(Date.now() + 60 * DAY) });

const events = () => sql`SELECT * FROM events ORDER BY id`;

beforeEach(async () => {
  await resetDb();
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  [{ id: venueId }] = await sql`
    INSERT INTO venues (city_id, name, address, lat, lon, aliases)
    VALUES (${city.id}, 'Klub Fantastyki Druga Era', 'Juliusza Słowackiego 13, 60-823 Poznań', 52.41, 16.9099, ${sql.array(["Druga Era"], "TEXT")})
    RETURNING id`;
});

describe("classification", () => {
  test("rules, keywords, defaults and requireMatch", async () => {
    const s = await makeSource({ category: null, config: { requireMatch: true, rules: [{ match: "Drugi Front", category: "BOARDGAMES", tags: ["gry bitewne"] }, { match: "Gunpla", skip: true }] } });
    expect(decide(s, cand({ title: "Drugi Front - gry bitewne" }))).toEqual({ keep: true, category: "BOARDGAMES", tags: ["gry bitewne"], guessed: false });
    expect(decide(s, cand({ title: "Mecha Dojo Gunpla" }))).toEqual({ keep: false, reason: "rule_skip" });
    expect(decide(s, cand({ title: "Larp: Gwiezdny Horyzont" }))).toMatchObject({ keep: true, category: "LARP" });
    expect(decide(s, cand({ title: "Kino" }))).toEqual({ keep: false, reason: "no_match" });
    const withDefault = await makeSource({ category: "IMPRO" });
    expect(decide(withDefault, cand({ title: "Improjber #2" }))).toMatchObject({ keep: true, category: "IMPRO" });
    const excl = await makeSource({ config: { exclude: "jazz" } });
    expect(decide(excl, cand({ title: "Improwizacje jazzowe" }))).toEqual({ keep: false, reason: "excluded" });
  });
});

describe("matchVenue", () => {
  const venues = [
    { id: 1, name: "Druga Era", address: null, aliases: [], lat: null, lon: null },
    { id: 2, name: "Klub Fantastyki Druga Era", address: "Słowackiego 13, Poznań", aliases: [], lat: 52.41, lon: 16.9099 },
    { id: 3, name: "Rojber Pub", address: "Feliksa Nowowiejskiego 8/5, Poznań", aliases: ["Rojber"], lat: 52.4094, lon: 16.927 },
  ];
  test("longest name, alias, street, coordinates", () => {
    expect(matchVenue(venues, { locationName: "Druga Era Klub Fantastyki" })).toBe(1);
    expect(matchVenue(venues, { locationName: "Klub Fantastyki Druga Era, ul. Słowackiego 13/116" })).toBe(2);
    expect(matchVenue(venues, { locationName: "pub ROJBER" })).toBe(3);
    expect(matchVenue(venues, { address: "ul. Feliksa Nowowiejskiego 8/5, 61-731 Poznań" })).toBe(3);
    expect(matchVenue(venues, { locationName: "Słowackiego 130" })).toBeNull();
    expect(matchVenue(venues, { locationName: "Somewhere", lat: 52.41003, lon: 16.90995 })).toBe(2);
    expect(matchVenue(venues, { locationName: "Somewhere", lat: 52.42, lon: 16.95 })).toBeNull();
  });
});

describe("processCandidates", () => {
  test("creates a draft with the matched venue, then is idempotent", async () => {
    const s = await makeSource();
    const r1 = await run(s, [cand()]);
    expect(r1.stats).toMatchObject({ created: 1 });
    const [e] = await events();
    expect(e).toMatchObject({ status: "DRAFT", origin: "IMPORTED", venue_id: venueId, source_id: s.id, category: "BOARDGAMES" });
    expect(e.slug).toMatch(/^wieczor-planszowkowy-\d{4}-\d{2}-\d{2}$/);
    const r2 = await run(s, [cand()]);
    expect(r2.stats).toMatchObject({ created: 0, unchanged: 1 });
    expect(await events()).toHaveLength(1);
  });

  test("AUTO_PUBLISH sources publish everything; events without a venue are flagged", async () => {
    const s = await makeSource({ trust: "AUTO_PUBLISH" });
    await run(s, [cand(), cand({ externalId: "ext-2", title: "Planszówki gdzieś", locationName: "Nieznane miejsce" })]);
    const [a, b] = await events();
    expect(a.status).toBe("PUBLISHED");
    expect(b.status).toBe("PUBLISHED");
    expect(b.review_flags).toEqual(["needs_venue"]);
  });

  test("updates owned events, but not ones an admin edited", async () => {
    const s = await makeSource();
    await run(s, [cand()]);
    await run(s, [cand({ title: "Wieczór planszówkowy XL" })]);
    expect((await events())[0].title).toBe("Wieczór planszówkowy XL");
    await sql`UPDATE events SET import_locked = true, title = 'Poprawione przez admina'`;
    const r = await run(s, [cand({ title: "Wieczór planszówkowy XXL" })]);
    expect(r.stats.updated).toBe(1);
    const [e] = await events();
    expect(e.title).toBe("Poprawione przez admina");
    expect(e.review_flags).toEqual(["changed_at_source"]);
  });

  test("cancellation at the source cancels the event", async () => {
    const s = await makeSource({ trust: "AUTO_PUBLISH" });
    await run(s, [cand()]);
    await run(s, [cand({ cancelled: true })]);
    expect((await events())[0].status).toBe("CANCELLED");
  });

  test("links duplicates across sources instead of creating them", async () => {
    const a = await makeSource();
    const b = await makeSource();
    await run(a, [cand({ title: "Druga Tura - gry planszowe i karciane" })]);
    const r = await run(b, [cand({ externalId: "fb-1", title: "Druga Tura – gry planszowe i karciane!", start: new Date(soon(3).getTime() + 30 * 60_000) })]);
    expect(r.stats.linked).toBe(1);
    expect(await events()).toHaveLength(1);
    const items = await sql`SELECT event_id FROM imported_items ORDER BY id`;
    expect(new Set(items.map((i: { event_id: number }) => i.event_id)).size).toBe(1);
    // The linked source doesn't overwrite the owner's event.
    await run(b, [cand({ externalId: "fb-1", title: "Coś zupełnie innego", start: soon(3) })]);
    expect((await events())[0].title).toBe("Druga Tura - gry planszowe i karciane");
  });

  test("drops out-of-area, past and cancelled-on-arrival items", async () => {
    const s = await makeSource();
    const r = await run(s, [
      cand({ externalId: "a", address: "ul. Długa 36, 85-034 Bydgoszcz", locationName: "Klub" }),
      cand({ externalId: "b", start: new Date(Date.now() - 3 * DAY) }),
      cand({ externalId: "c", cancelled: true }),
    ]);
    expect(r.stats.skipped).toEqual({ out_of_area: 1, past: 1, cancelled: 1 });
    expect(await events()).toHaveLength(0);
  });

  test("flags events that disappear from a complete listing, and unflags when they return", async () => {
    const s = await makeSource();
    await run(s, [cand(), cand({ externalId: "ext-2", title: "Turniej planszówkowy" })], true);
    const r = await run(s, [cand()], true);
    expect(r.stats.missing).toBe(1);
    const [, gone] = await events();
    expect(gone.review_flags).toEqual(["missing_from_source"]);
    await run(s, [cand(), cand({ externalId: "ext-2", title: "Turniej planszówkowy" })], true);
    expect((await events())[1].review_flags).toEqual([]);
  });

  test("does not resurrect events an admin deleted", async () => {
    const s = await makeSource();
    await run(s, [cand()]);
    await sql`DELETE FROM events`;
    const r = await run(s, [cand({ title: "Wieczór planszówkowy (zmiana)" })]);
    expect(r.stats.skipped).toEqual({ rejected: 1 });
    expect(await events()).toHaveLength(0);
  });

  test("recurring occurrences share a series; places with coordinates become venues", async () => {
    const s = await makeSource();
    await run(s, [
      cand({ externalId: "u@1", seriesKey: "u", seriesRule: "FREQ=WEEKLY", start: soon(2) }),
      cand({ externalId: "u@2", seriesKey: "u", seriesRule: "FREQ=WEEKLY", start: soon(9) }),
      cand({ externalId: "x", title: "Impro jam", locationName: "Nowe Miejsce", lat: 52.40, lon: 16.93, start: soon(4) }),
    ]);
    const [a, b, c] = await events();
    expect(a.series_id).not.toBeNull();
    expect(a.series_id).toBe(b.series_id);
    const [v] = await sql`SELECT name FROM venues WHERE id = ${c.venue_id}`;
    expect(v.name).toBe("Nowe Miejsce");
    expect(c.category).toBe("IMPRO");
  });

  test("manual imports keep everything and flag guessed categories", async () => {
    const s = await makeSource({ kind: "MANUAL_URL", category: null });
    const { eventIds } = await processCandidates(s, { candidates: [cand({ title: "Spotkanie", start: new Date(Date.now() - DAY) })], complete: false }, { manual: true });
    const [e] = await events();
    expect(eventIds.get("ext-1")).toBe(e.id);
    expect(e.status).toBe("DRAFT");
    expect(e.review_flags).toEqual(["check_category"]);
  });
});

describe("priceOf", () => {
  test("no price anywhere means free, unless there is a ticket link", () => {
    expect(priceOf(cand({ description: "Gramy w planszówki, zapraszamy!" }))).toEqual({ isFree: true, priceMin: null, priceMax: null });
    expect(priceOf(cand({ ticketUrl: "https://bilety.example/1" }))).toEqual({ isFree: false, priceMin: null, priceMax: null });
  });

  test("a price in the description wins over the free default", () => {
    expect(priceOf(cand({ description: "Cena: 165zł, jest w to wliczona sala" }))).toEqual({ isFree: false, priceMin: 165, priceMax: 165 });
    expect(priceOf(cand({ title: "Turniej", description: "Wpisowe: 31pln od osoby" }))).toMatchObject({ isFree: false, priceMin: 31 });
  });

  test("free in the title beats a price from the description", () => {
    expect(priceOf(cand({ title: "Otwarte darmowe spotkanie improwizacji", description: "Kurs: 600 zł", priceMin: 600, priceMax: 600 })))
      .toEqual({ isFree: true, priceMin: null, priceMax: null });
  });

  test("the adapter's own price or free flag is kept", () => {
    expect(priceOf(cand({ priceMin: 40, priceMax: 60 }))).toEqual({ isFree: false, priceMin: 40, priceMax: 60 });
    expect(priceOf(cand({ isFree: true, description: "Cena 20 zł" }))).toEqual({ isFree: true, priceMin: null, priceMax: null });
  });

  test("imported events without a price are stored as free", async () => {
    const s = await makeSource();
    await run(s, [cand()]);
    expect((await events())[0]).toMatchObject({ is_free: true, price_min: null });
  });
});

describe("languageOf", () => {
  const STANDUP = "CSK is back with another English Stand-Up Comedy Open Mic in Poznań! Whether you're a comedy enthusiast, " +
    "an aspiring comedian, or simply someone who enjoys a good laugh, you're very welcome.";
  test("English text or an English event announced in Polish", () => {
    expect(languageOf({ title: "Stand-Up Open Mic", description: STANDUP })).toBe("en");
    expect(languageOf({ title: "English Stand-Up Comedy Open Mic", description: "" })).toBe("en");
    expect(languageOf({ title: "Sesja RPG", description: "Sesja jest prowadzona po angielsku, zapraszamy." })).toBe("en");
  });

  test("bilingual events and descriptions", () => {
    expect(languageOf({ title: "Impro jam", description: "Gramy po polsku i angielsku." })).toBe("both");
    expect(languageOf({ title: "Planszówki PL/EN", description: "" })).toBe("both");
    expect(languageOf({
      title: "Planszówki",
      description: "Spotkanie dla graczy, nie trzeba się zapisywać, jest herbata i ciastka na stole.\n\n" +
        "A meetup for players: you don't need to sign up, the tea is on us and we will teach you the rules of every game.",
    })).toBe("both");
  });

  test("Polish text with a few English words stays Polish", () => {
    expect(languageOf({ title: "Monopoly Night", description: "Gramy w Monopoly. Who's ready to win? Zapisy na miejscu." })).toBe("pl");
    expect(languageOf({ title: "Druga Tura", description: "Gry planszowe i karciane w klubie, wstęp wolny dla wszystkich." })).toBe("pl");
  });

  test("imports store the language and update it", async () => {
    const s = await makeSource();
    await run(s, [cand({ title: "Board game night", description: STANDUP })]);
    expect((await events())[0].language).toBe("en");
    await run(s, [cand({ title: "Wieczór planszówkowy", description: "Gramy w planszówki, zapraszamy!" })]);
    expect((await events())[0].language).toBe("pl");
  });
});

test("title keywords beat description keywords", async () => {
  const s = await makeSource({ category: null, config: { requireMatch: true } });
  expect(decide(s, cand({ title: "Wieczór Gier Planszowych", description: "Będzie też kącik RPG i one-shot" }))).toMatchObject({ category: "BOARDGAMES" });
  const titleOnly = await makeSource({ category: null, config: { requireMatch: true, matchOn: ["title"] } });
  expect(decide(titleOnly, cand({ title: "Rocznica wjazdu generała", description: "gry planszowe dla dzieci" }))).toEqual({ keep: false, reason: "no_match" });
});
