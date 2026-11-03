import { expect, test } from "bun:test";
import { buildIcs, escapeText, foldLine } from "../src/lib/ics.ts";

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
