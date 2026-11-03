// Adapter parsers against small synthetic inputs and trimmed real pages (tests/fixtures).
import { describe, expect, test } from "bun:test";
import { calendarPage, expandEvents, parseIcs } from "../src/importers/adapters/ics.ts";
import { apifyToCandidates, facebookEventId, pageEventsUrl, parseFacebookEvent, parsePageEventIds } from "../src/importers/adapters/facebook.ts";
import { extractJsonLdEvents, jsonLdToCandidate } from "../src/importers/adapters/jsonld.ts";
import { poznanPlToCandidate } from "../src/importers/adapters/poznanPl.ts";
import { htmlToText, isLocal, parsePrice, zonedToUtc } from "../src/importers/util.ts";
import type { EventCandidate } from "../src/importers/types.ts";

const fixture = (name: string) => Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
const warsawFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
const local = (d: Date) => warsawFmt.format(d); // "2026-11-05 18:00"

const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body.trim().replace(/\n/g, "\r\n")}\r\nEND:VCALENDAR\r\n`;

describe("zonedToUtc", () => {
  test("handles both sides of DST", () => {
    expect(zonedToUtc(2026, 7, 1, 18, 0).toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 18, 0).toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
  test("moves times in the spring gap forward", () => {
    expect(local(zonedToUtc(2027, 3, 28, 2, 30))).toBe("2027-03-28 03:30");
  });
});

describe("ICS", () => {
  const from = new Date("2026-10-19T00:00:00Z");
  const to = new Date("2026-11-10T00:00:00Z");

  test("weekly rule keeps local time across the DST change, with EXDATE and an override", () => {
    const events = parseIcs(ics(`
BEGIN:VEVENT
UID:weekly@test
DTSTART;TZID=Europe/Warsaw:20181115T180000
DTEND;TZID=Europe/Warsaw:20181115T220000
RRULE:FREQ=WEEKLY;BYDAY=TH
EXDATE;TZID=Europe/Warsaw:20261029T180000
SUMMARY:Druga Tura - gry planszowe
LOCATION:Druga Era Klub Fantastyki\\, Słowackiego 13
DESCRIPTION:Linia pierwsza\\nlinia druga z bardzo długim tekstem który zostaje
  zawinięty
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
RECURRENCE-ID;TZID=Europe/Warsaw:20261105T180000
DTSTART;TZID=Europe/Warsaw:20261105T190000
DTEND;TZID=Europe/Warsaw:20261105T230000
SUMMARY:Druga Tura - wydanie specjalne
END:VEVENT`));
    const c = expandEvents(events, { from, to }).sort((a, b) => +a.start - +b.start);
    expect(c.map((x) => [local(x.start), x.title])).toEqual([
      ["2026-10-22 18:00", "Druga Tura - gry planszowe"], // CEST
      // 29 Oct excluded
      ["2026-11-05 19:00", "Druga Tura - wydanie specjalne"], // override (CET)
    ]);
    expect(c[0]!.externalId).toBe("weekly@test@20261022");
    expect(c[1]!.externalId).toBe("weekly@test@20261105"); // same key the generated occurrence would have had
    expect(c[0]!.locationName).toBe("Druga Era Klub Fantastyki, Słowackiego 13");
    expect(c[0]!.description).toBe("Linia pierwsza\nlinia druga z bardzo długim tekstem który zostaje zawinięty");
    expect(c[0]!.seriesKey).toBe("weekly@test");
    expect(local(c[0]!.end!)).toBe("2026-10-22 22:00");
  });

  test("UNTIL, non-Warsaw TZIDs, all-day events and cancellations", () => {
    const events = parseIcs(ics(`
BEGIN:VEVENT
UID:ceuta@test
DTSTART;TZID=Africa/Ceuta:20211110T193000
DTEND;TZID=Africa/Ceuta:20211110T230000
RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261028T225959Z
SUMMARY:Wednesday
END:VEVENT
BEGIN:VEVENT
UID:allday@test
DTSTART;VALUE=DATE:20261024
DTEND;VALUE=DATE:20261026
SUMMARY:Kiermasz
END:VEVENT
BEGIN:VEVENT
UID:cancelled@test
DTSTART:20261101T170000Z
SUMMARY:Odwołane
STATUS:CANCELLED
END:VEVENT`));
    const c = expandEvents(events, { from, to }).sort((a, b) => +a.start - +b.start);
    expect(c.map((x) => `${local(x.start)} ${x.title}`)).toEqual([
      "2026-10-21 19:30 Wednesday",
      "2026-10-24 00:00 Kiermasz",
      "2026-10-28 19:30 Wednesday",
      "2026-11-01 18:00 Odwołane",
    ]);
    const allDay = c.find((x) => x.title === "Kiermasz")!;
    expect(allDay.allDay).toBe(true);
    expect(local(allDay.end!)).toBe("2026-10-26 00:00");
    expect(c.find((x) => x.title === "Odwołane")!.cancelled).toBe(true);
  });

  test("real Meetup feed", async () => {
    const c = expandEvents(parseIcs(await fixture("meetup-playzone.ics")), { from, to: new Date("2027-01-01") });
    expect(c).toHaveLength(1);
    expect(c[0]!.title).toBe("Monopoly Night");
    expect(local(c[0]!.start)).toBe("2026-11-14 19:00");
    expect(c[0]!.url).toBe("https://www.meetup.com/play-connect-pozna%C5%84/events/317201271/");
  });
  test("source links: description URL without trailing punctuation, Google Calendar page", () => {
    const [e] = parseIcs(ics(`BEGIN:VEVENT
UID:link@test
DTSTART:20261105T170000Z
SUMMARY:Drugi Smok
DESCRIPTION:Grupa (https://www.facebook.com/groups/drugamacka).
END:VEVENT`));
    expect(expandEvents([e!], { from, to })[0]!.url).toBe("https://www.facebook.com/groups/drugamacka");
    expect(calendarPage("https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics"))
      .toBe("https://calendar.google.com/calendar/embed?src=abc%40group.calendar.google.com&ctz=Europe%2FWarsaw");
    expect(calendarPage("https://www.meetup.com/play-connect-pozna%C5%84/events/ical/")).toBeNull();
  });
});

describe("Facebook", () => {
  test("event ids from URLs", () => {
    expect(facebookEventId("https://www.facebook.com/events/2282431032610261/")).toBe("2282431032610261");
    expect(facebookEventId("https://www.facebook.com/events/d41d8cd9/la-vida-impro-improjber-1/2282431032610261/")).toBe("2282431032610261");
    expect(facebookEventId("https://m.facebook.com/events/123456789?ref=x")).toBe("123456789");
    expect(facebookEventId("https://example.com/events/123456789")).toBeNull();
    expect(facebookEventId("https://www.facebook.com/LaVidaImpro")).toBeNull();
  });

  test("event page with place, address and end time", async () => {
    const c = parseFacebookEvent(await fixture("fb-event-405084906895197.html"), "405084906895197")!;
    expect(c.title).toBe("Urodzinowy Maraton Larpowy");
    expect(c.start.toISOString()).toBe("2019-03-23T09:00:00.000Z");
    expect(c.end!.toISOString()).toBe("2019-03-23T19:00:00.000Z");
    expect(c.locationName).toBe("Klub Fantastyki Druga Era");
    expect(c.address).toBe("ul. Słowackiego 13/116, 60-822 Poznań");
    expect([c.lat, c.lon]).toEqual([52.40999, 16.91111]);
    expect(c.organizerName).toBe("Nautilus Larps Project");
    expect(c.cancelled).toBe(false);
    expect(c.description.length).toBeGreaterThan(100);
  });

  test("ignores suggested events on the same page", async () => {
    const c = parseFacebookEvent(await fixture("fb-event-1375219764462851.html"), "1375219764462851")!;
    expect(c.title).toBe("Larp: U Kresu Drogi");
    expect(c.locationName).toBe("Karczma Wrzos");
    expect(c.end).toBeNull();
    expect(isLocal(c)).toBe(false); // Ustroń, 43-450
  });

  test("page listing", async () => {
    expect(parsePageEventIds(await fixture("fb-page-larpunk.html"))).toEqual([
      "2617208515372087", "1375219764462851", "1468870195135355", "1112238395071520",
    ]);
    expect(parsePageEventIds("<html><title>Facebook</title></html>")).toBeNull(); // login wall
  });

  test("Apify dataset item", () => {
    const [c] = apifyToCandidates({
      id: "1269179411830316", name: "Comedy Night", utcStartDate: "2026-04-24T22:30:00.000Z",
      isCanceled: false, address: "ul. Rybaki 22, Poznań", description: "Opis",
      location: { name: "Podziemie", latitude: 52.40185, longitude: 16.9302 },
      ticketsInfo: { buyUrl: "https://bilety.example/1" },
    }) as [EventCandidate];
    expect(c.externalId).toBe("1269179411830316");
    expect(c.url).toBe("https://www.facebook.com/events/1269179411830316/");
    expect(c.ticketUrl).toBe("https://bilety.example/1");
    expect(c.lat).toBe(52.40185);
  });

  test("Page events URLs for handles and numeric profile ids", () => {
    expect(pageEventsUrl("https://www.facebook.com/DPRimpro")).toBe("https://www.facebook.com/DPRimpro/upcoming_hosted_events");
    expect(pageEventsUrl("https://www.facebook.com/profile.php?id=61582069984035"))
      .toBe("https://www.facebook.com/profile.php?id=61582069984035&sk=upcoming_hosted_events");
    expect(pageEventsUrl("https://www.facebook.com/profile.php?id=61582069984035", "events"))
      .toBe("https://www.facebook.com/profile.php?id=61582069984035&sk=events");
    expect(() => pageEventsUrl("https://www.facebook.com/profile.php")).toThrow();
  });

  test("Apify recurring event: one candidate per occurrence", () => {
    const cs = apifyToCandidates({
      id: "1602578478228882", name: "Trench Crusade w Wargamerze", eventFrequency: "WEEKLY",
      utcStartDate: "2026-10-27T16:00:00.000Z", location: { name: "Święty Marcin 47", latitude: 52.40653, longitude: 16.9235 },
      childEvents: [
        { id: "1602578478228882", utcStartDate: "2026-10-27T16:00:00.000Z", utcEndDate: "2026-10-27T20:00:00.000Z" },
        { id: "1602578471562216", utcStartDate: "2026-11-03T16:00:00.000Z", utcEndDate: "2026-11-03T20:00:00.000Z" },
      ],
    });
    expect(cs.map((c) => c.externalId)).toEqual(["1602578478228882", "1602578471562216"]);
    expect(cs[1]!.end!.toISOString()).toBe("2026-11-03T20:00:00.000Z");
    expect(cs[1]!.url).toBe("https://www.facebook.com/events/1602578471562216/");
    expect(cs[1]!.title).toBe("Trench Crusade w Wargamerze");
  });
});

describe("JSON-LD", () => {
  test("events nested in an ItemList (Biletyna)", async () => {
    const html = await fixture("biletyna-kabaret-poznan.html");
    const events = extractJsonLdEvents(html);
    expect(events.length).toBe(12);
    const impro = events.map((o) => jsonLdToCandidate(o, "https://biletyna.pl/kabaret/Poznan")!).filter((c) => /impro/i.test(c.title));
    expect(impro.length).toBe(2);
    const c = impro[0]!;
    expect(c.title).toBe("Kabaret hrAbi & Goście - Świąteczne Impro");
    expect(local(c.start)).toBe("2026-12-17 17:30");
    expect(c.address).toContain("Poznań");
    expect(c.priceMin).toBeGreaterThan(0);
    expect(c.url).not.toContain("#");
    expect(c.externalId).not.toBe(impro[1]!.externalId);
  });

  test("dates without offsets are Warsaw time", () => {
    const c = jsonLdToCandidate({ "@type": "SocialEvent", name: "Gra", startDate: "2026-12-01T19:00" }, "https://x.test/")!;
    expect(local(c.start)).toBe("2026-12-01 19:00");
  });
});

describe("poznan.pl", () => {
  test("maps the JSON fields", async () => {
    const data = JSON.parse(await fixture("poznan-pl-events.json"));
    const c = poznanPlToCandidate(data.events[0])!;
    expect(c.externalId).toBe("188438@2026-11-03");
    expect(local(c.start)).toBe("2026-11-03 09:30");
    expect(c.description).not.toContain("<");
    expect(c.url).toMatch(/^https:\/\/kultura\.poznan\.pl\/mim\/kultura\/events\/2026-11-03\/.+,188438\.html$/);
    const multiDay = poznanPlToCandidate({ id: "1", title: "HOBBYCon", date_from: "2026-11-14", hour_from: "10:00", date_to: "2026-11-15", hour_to: "18:00" })!;
    expect(local(multiDay.end!)).toBe("2026-11-15 18:00");
  });
});

describe("text helpers", () => {
  test("htmlToText keeps paragraphs and decodes entities", () => {
    expect(htmlToText("<p>Wst&#x119;p&nbsp;wolny</p><p>A<br>B</p><script>x()</script>")).toBe("Wstęp wolny\n\nA\nB");
  });
  test("parsePrice", () => {
    expect(parsePrice("Bilety: 25 zł / 30 zł")).toEqual({ isFree: false, priceMin: 25, priceMax: 30 });
    expect(parsePrice("Wstęp wolny!").isFree).toBe(true);
    expect(parsePrice("Zapraszamy").isFree).toBe(false);
  });
  test("isLocal", () => {
    expect(isLocal({ lat: 52.41, lon: 16.91 })).toBe(true);
    expect(isLocal({ lat: 51.1, lon: 17.03 })).toBe(false); // Wrocław
    expect(isLocal({ address: "ul. Długa 36, 85-034 Bydgoszcz" })).toBe(false);
    expect(isLocal({ address: "os. Pod Lipami 108A, 61-632 Poznań" })).toBe(true);
    expect(isLocal({ locationName: "Rojber Pub" })).toBe(true);
  });
});
