import { expect, test } from "bun:test";
import { buildIcs, escapeText, foldLine, googleCalendarUrl } from "../src/lib/ics.ts";

test("escapes text values", () => {
  expect(escapeText("a,b;c\\d\nnext")).toBe("a\\,b\\;c\\\\d\\nnext");
});

test("folds long lines at 75 octets without splitting UTF-8 characters", () => {
  const line = "SUMMARY:" + "żółw ".repeat(30);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  expect(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
});

test("builds a VEVENT with UTC times and a default 3h end", () => {
  const ics = buildIcs([{ uid: "event-1@x", title: "Impro jam", start: new Date("2026-11-05T18:00:00Z"), end: null, location: "Kosteczka" }]);
  expect(ics).toContain("BEGIN:VCALENDAR\r\n");
  expect(ics).toContain("DTSTART:20261105T180000Z\r\n");
  expect(ics).toContain("DTEND:20261105T210000Z\r\n");
  expect(ics).toContain("SUMMARY:Impro jam\r\n");
  expect(ics).toContain("STATUS:CONFIRMED");
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
});

test("Google Calendar link: UTC times, default 3h end, location and details", () => {
  const u = new URL(googleCalendarUrl({
    uid: "x", title: "Impro jam", description: "Opis", location: "Klub, Poznań",
    start: new Date("2026-11-05T18:00:00Z"), end: null,
  }));
  expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
  expect(u.searchParams.get("action")).toBe("TEMPLATE");
  expect(u.searchParams.get("text")).toBe("Impro jam");
  expect(u.searchParams.get("dates")).toBe("20261105T180000Z/20261105T210000Z");
  expect(u.searchParams.get("location")).toBe("Klub, Poznań");
  expect(u.searchParams.get("details")).toBe("Opis");
});

test("Google Calendar link: an all-day event goes as Warsaw dates with an exclusive end", () => {
  // Midnight-to-midnight in Warsaw, across the October DST change.
  const u = new URL(googleCalendarUrl(
    { uid: "x", title: "Konwent", start: new Date("2026-10-24T22:00:00Z"), end: new Date("2026-10-25T23:00:00Z") },
    true,
  ));
  expect(u.searchParams.get("dates")).toBe("20261025/20261026");
});

test("Google Calendar link: a long description is cut and keeps the event link", () => {
  const u = new URL(googleCalendarUrl({
    uid: "x", title: "T", description: "a".repeat(2000), url: "https://karczma.test/events/t",
    start: new Date("2026-11-05T18:00:00Z"), end: null,
  }));
  const details = u.searchParams.get("details")!;
  expect(details.length).toBeLessThan(600);
  expect(details.endsWith("https://karczma.test/events/t")).toBe(true);
});
