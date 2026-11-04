import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { EventPage } from "../src/routes/EventPage.tsx";
import { t } from "../src/shared/i18n/index.ts";
import type { EventDetail } from "../src/shared/types.ts";

const base: EventDetail = {
  id: 1, slug: "drugi-run-2026-11-07", title: "Drugi Run – Larp Gwiezdny Horyzont", excerpt: "", category: "LARP",
  tags: [], start_at: "2026-11-07T09:00:00Z", end_at: "2026-11-07T19:00:00Z", is_free: false, price_min: 120,
  price_max: null, currency: "PLN", language: "pl", beginner_friendly: true, ticket_url: "https://example.org/zapisy",
  status: "PUBLISHED", is_recurring: false, venue: null, organizer: null, description: "Opis.\n\nDrugi akapit.",
  source_url: "https://www.facebook.com/events/1", image_url: null, updated_at: "2026-11-02T10:00:00Z",
  venue_website: null, organizer_website: null,
};
const before = new Date("2026-11-03T12:00:00Z");
const after = new Date("2026-11-08T12:00:00Z");
const render = (e: Partial<EventDetail>, now: Date) =>
  renderToString(<EventPage e={{ ...base, ...e }} url="https://karczma.test/events/x" now={now} />);

describe("EventPage", () => {
  test("upcoming: tickets, add to calendar and share", () => {
    const html = render({}, before);
    expect(html).toContain(t.event.tickets);
    expect(html).toContain(`href="/events/${base.slug}.ics"`);
    expect(html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(html).toContain(t.event.share);
    expect(html).not.toContain(t.event.pastTitle);
    expect(html).toContain("120 zł");
  });

  test("cancelled: stamp and closed sign-ups, no tickets or calendar file", () => {
    const html = render({ status: "CANCELLED" }, before);
    expect(html).toContain(t.event.cancelledTitle);
    expect(html).toContain(t.event.closed);
    expect(html).not.toContain(t.event.tickets);
    expect(html).not.toContain(".ics");
    expect(html).not.toContain("calendar.google.com");
  });

  test("past: notice, Minione badge and a link to upcoming events", () => {
    const html = render({}, after);
    expect(html).toContain(t.event.pastTitle);
    expect(html).toContain(t.event.past);
    expect(html).toContain(t.event.upcoming);
    expect(html).not.toContain(t.event.tickets);
  });

  test("no cover image: the category seal; no venue: to be confirmed", () => {
    const html = render({}, before);
    expect(html).toContain("cover--none");
    expect(html).toContain(t.list.venueTbd);
  });

  test("the venue name links to Google Maps: name and address when known, else coordinates", () => {
    const venue = { id: 1, name: "Pod Lipami", address: "ul. Lipowa 1", district: null, lat: 52.4, lon: 16.9 };
    expect(render({ venue }, before)).toContain(
      `href="https://www.google.com/maps/search/?api=1&amp;query=Pod%20Lipami%2C%20ul.%20Lipowa%201" rel="noopener">Pod Lipami</a>`);
    expect(render({ venue: { ...venue, address: null } }, before)).toContain(
      `href="https://www.google.com/maps/search/?api=1&amp;query=52.4%2C16.9"`);
    expect(render({ venue: { ...venue, address: null, lat: null, lon: null } }, before)).not.toContain("maps/search");
  });

  test("an all-day event reads 'cały dzień', not 00:00 – 00:00", () => {
    const html = render({ start_at: "2026-11-04T23:00:00Z", end_at: "2026-11-05T23:00:00Z" }, before);
    expect(html).toContain(t.list.allDay);
    expect(html).not.toMatch(/00:00(<!-- -->)? –/);
  });

  test("description text is escaped, never parsed as HTML", () => {
    const html = render({ description: "<script>alert(1)</script>" }, before);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
