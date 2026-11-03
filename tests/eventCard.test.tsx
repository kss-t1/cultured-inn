import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { t } from "../src/shared/i18n/index.ts";
import type { PublicEvent } from "../src/shared/types.ts";
import { EventCard } from "../src/site/components/EventList.tsx";

const base: PublicEvent = {
  id: 1, slug: "x", title: "Wieczór planszówkowy", excerpt: "", category: "BOARDGAMES", tags: [],
  start_at: "2026-11-05T17:00:00Z", end_at: "2026-11-05T21:00:00Z", is_free: true, price_min: null, price_max: null,
  currency: "PLN", language: "pl", beginner_friendly: false, ticket_url: null, status: "PUBLISHED",
  is_recurring: false, venue: null, organizer: null,
};
const card = (e: Partial<PublicEvent>) => renderToString(<EventCard e={{ ...base, ...e }} />);

describe("EventCard", () => {
  test("an ICS all-day event (00:00 to 00:00 next day, Warsaw) is one day, not '1 dni'", () => {
    const html = card({ start_at: "2026-11-04T23:00:00Z", end_at: "2026-11-05T23:00:00Z" });
    expect(html).toContain(t.list.allDay);
    expect(html).not.toContain(t.list.days);
    expect(html).not.toContain(t.event.multiday);
  });

  test("a weekend convention shows its day count and the multi-day badge", () => {
    const html = card({ start_at: "2026-11-06T17:00:00Z", end_at: "2026-11-08T20:00:00Z" });
    expect(html).toContain(`<span class="card__time">3</span><span class="card__end">${t.list.days}</span>`);
    expect(html).toContain(t.event.multiday);
  });

  test("an evening shows start and end time", () => {
    const html = card({});
    expect(html).toContain(`<span class="card__time">18:00</span>`);
    expect(html).toMatch(/<span class="card__end">–(<!-- -->)?22:00<\/span>/);
    expect(html).not.toContain(t.event.multiday);
  });
});
