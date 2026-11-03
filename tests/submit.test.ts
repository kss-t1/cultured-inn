import { beforeEach, describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { sql } from "../src/db.ts";
import { fieldErrors } from "../src/lib/http.ts";
import { queryEvents } from "../src/lib/events.ts";
import { SUBMIT_LIMIT, submitEvent } from "../src/routes/submit.ts";
import { DEFAULT_FILTERS } from "../src/shared/filters.ts";
import { addVenue, resetDb, warsaw } from "./helpers.ts";

const form = (patch: Record<string, unknown> = {}) => ({
  title: "Jam impro dla każdego",
  category: "IMPRO",
  start_local: "2026-11-20T19:00",
  location: "Klub Pod Minogą, Nowowiejskiego 8",
  link: "https://www.facebook.com/events/123456789/",
  contact_name: "Ola",
  contact_email: "ola@example.com",
  ...patch,
});

let now: Date;
beforeEach(async () => {
  await resetDb();
  now = await warsaw("2026-11-10 12:00");
});

describe("submitEvent", () => {
  test("creates a flagged DRAFT that stays off the public site, with the contact kept aside", async () => {
    const r = await submitEvent(form(), "10.0.0.1", now);
    expect(r.ok).toBe(true);
    const [e] = await sql`SELECT status, origin, review_flags, source_url, venue_id FROM events`;
    expect(e).toMatchObject({
      status: "DRAFT", origin: "MANUAL", review_flags: ["submitted", "needs_venue"],
      source_url: "https://www.facebook.com/events/123456789/", venue_id: null,
    });
    const [s] = await sql`SELECT location_text, contact_email, ip FROM submissions`;
    expect(s).toMatchObject({ location_text: "Klub Pod Minogą, Nowowiejskiego 8", contact_email: "ola@example.com", ip: "10.0.0.1" });
    expect(await queryEvents({ ...DEFAULT_FILTERS, cats: [], tags: [] }, { now })).toEqual([]);
  });

  test("matches a known venue from the location text", async () => {
    const venueId = await addVenue("Pod Minogą", 52.41, 16.93);
    await submitEvent(form(), "10.0.0.1", now);
    const [e] = await sql`SELECT venue_id, review_flags FROM events`;
    expect(e).toMatchObject({ venue_id: venueId, review_flags: ["submitted"] });
  });

  test("honeypot: reports success but stores nothing", async () => {
    expect(await submitEvent(form({ website: "http://spam.example" }), "10.0.0.1", now)).toEqual({ ok: true, eventId: null });
    const [{ n }] = await sql`SELECT (SELECT count(*) FROM events) + (SELECT count(*) FROM submissions) AS n`;
    expect(Number(n)).toBe(0);
  });

  test(`rate limit: ${SUBMIT_LIMIT} per IP per hour`, async () => {
    for (let i = 0; i < SUBMIT_LIMIT; i++) expect((await submitEvent(form(), "10.0.0.1", now)).ok).toBe(true);
    expect(await submitEvent(form(), "10.0.0.1", now)).toEqual({ ok: false, reason: "rate_limited" });
    expect((await submitEvent(form(), "10.0.0.2", now)).ok).toBe(true);
    const later = new Date(now.getTime() + 61 * 60_000);
    expect((await submitEvent(form(), "10.0.0.1", later)).ok).toBe(true);
  });

  test("rejects past dates and invalid input", async () => {
    expect(await submitEvent(form({ start_local: "2026-11-10T11:00" }), "10.0.0.1", now)).toEqual({ ok: false, reason: "in_past" });
    const err = await submitEvent(form({ category: undefined, link: "javascript:alert(1)", contact_email: "nope" }), "10.0.0.1", now)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
    expect(fieldErrors(err)).toEqual({ category: "required", link: "invalid_url", contact_email: "invalid_email" });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM events`;
    expect(n).toBe(0);
  });
});
