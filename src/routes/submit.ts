// POST /api/submit: the public "Zgłoś wydarzenie" form. Submissions become DRAFT events flagged
// 'submitted', so nothing appears on the site until an admin publishes it.
import type { BunRequest, Server } from "bun";
import { sql, TZ } from "../db.ts";
import { loadVenues, matchVenue } from "../importers/pipeline.ts";
import { checkOrigin, clientIp } from "../lib/auth.ts";
import { error, handleError, json, readJson } from "../lib/http.ts";
import { uniqueSlug } from "../lib/slugs.ts";
import { SubmitInput } from "../shared/schemas.ts";

export const SUBMIT_LIMIT = 5;
export const SUBMIT_WINDOW = "1 hour";

export type SubmitResult =
  | { ok: true; eventId: number | null }
  | { ok: false; reason: "rate_limited" | "in_past" };

/** `eventId` is null when the honeypot was filled: the bot is told it worked, nothing is stored. */
export async function submitEvent(input: unknown, ip: string, now = new Date()): Promise<SubmitResult> {
  const s = SubmitInput.parse(input);
  if (s.website) return { ok: true, eventId: null };

  const venueId = matchVenue(await loadVenues(), { locationName: s.location, address: null, lat: null, lon: null });
  const flags = venueId === null ? ["submitted", "needs_venue"] : ["submitted"];
  const slug = await uniqueSlug(s.title, s.start_local);
  return sql.begin(async (tx): Promise<SubmitResult> => {
    // Serializes submissions per IP, so parallel requests can't all pass the count below.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`submit:${ip}`}))`;
    const [check] = await tx`
      SELECT (SELECT count(*)::int FROM submissions
              WHERE ip = ${ip} AND created_at > ${now}::timestamptz - ${SUBMIT_WINDOW}::interval) AS recent,
             (${s.start_local}::timestamp AT TIME ZONE ${TZ}) < ${now}::timestamptz AS past`;
    if (check.recent >= SUBMIT_LIMIT) return { ok: false, reason: "rate_limited" };
    if (check.past) return { ok: false, reason: "in_past" };
    const [ev] = await tx`
      INSERT INTO events (city_id, slug, title, description, category, start_at, end_at, venue_id,
                          is_free, beginner_friendly, source_url, status, origin, review_flags)
      SELECT id, ${slug}, ${s.title}, ${s.description}, ${s.category}::category,
             (${s.start_local}::timestamp AT TIME ZONE ${TZ}), (${s.end_local}::timestamp AT TIME ZONE ${TZ}),
             ${venueId}, ${s.is_free}, ${s.beginner_friendly}, ${s.link}, 'DRAFT', 'MANUAL', ${sql.array(flags, "TEXT")}
      FROM cities WHERE slug = 'poznan'
      RETURNING id`;
    await tx`
      INSERT INTO submissions (event_id, location_text, contact_name, contact_email, ip, created_at)
      VALUES (${ev.id}, ${s.location}, ${s.contact_name}, ${s.contact_email}, ${ip}, ${now})`;
    // IPs are only needed for the rate limit.
    await tx`UPDATE submissions SET ip = NULL WHERE ip IS NOT NULL AND created_at < ${now}::timestamptz - interval '30 days'`;
    return { ok: true, eventId: ev.id as number };
  });
}

async function postSubmit(req: BunRequest, server: Server<unknown>) {
  try {
    if (!checkOrigin(req)) return error(403, "forbidden_origin");
    const r = await submitEvent(await readJson(req), clientIp(req, server));
    if (r.ok) return json({ ok: true }, { status: 201 });
    if (r.reason === "rate_limited") return error(429, "rate_limited");
    return error(400, "validation_failed", { fields: { start_local: "in_past" } });
  } catch (e) {
    return handleError(e);
  }
}

export const submitRoutes = {
  "/api/submit": { POST: postSubmit },
};
