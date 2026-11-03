// /api/admin/* — JSON API for the admin SPA. Every handler goes through `admin()`,
// which enforces the Origin check on mutating requests and requires a valid session.
import type { BunRequest, Server } from "bun";
import { sql, TZ } from "../db.ts";
import {
  checkOrigin, clearSessionCookie, clientIp, login, logout, SESSION_COOKIE, setSessionCookie,
  userForToken, type AdminUser,
} from "../lib/auth.ts";
import { geocode } from "../lib/geocode.ts";
import { uniqueSlug } from "../lib/slugs.ts";
import { error, handleError, HttpError, json, parseId, readJson } from "../lib/http.ts";
import { EventInput, LoginInput, OrganizerInput, StatusInput, VenueInput, STATUSES } from "../shared/schemas.ts";

export type Handler<P extends string> = (req: BunRequest<P>, user: AdminUser, server: Server<unknown>) => Promise<Response>;

export function admin<P extends string>(handler: Handler<P>) {
  return async (req: BunRequest<P>, server: Server<unknown>) => {
    try {
      if (!checkOrigin(req)) return error(403, "forbidden_origin");
      const user = await userForToken(req.cookies.get(SESSION_COOKIE));
      if (!user) return error(401, "unauthorized");
      return await handler(req, user, server);
    } catch (e) {
      return handleError(e);
    }
  };
}

// ---------- auth ----------

async function postLogin(req: BunRequest, server: Server<unknown>) {
  try {
    if (!checkOrigin(req)) return error(403, "forbidden_origin");
    const { email, password } = LoginInput.parse(await readJson(req));
    const result = await login(email, password, clientIp(req, server), req.headers.get("user-agent"));
    if (!result.ok) {
      return result.reason === "locked"
        ? error(429, "locked_out")
        : error(401, "invalid_credentials");
    }
    setSessionCookie(req, result.token);
    return json({ user: result.user });
  } catch (e) {
    return handleError(e);
  }
}

async function postLogout(req: BunRequest) {
  if (!checkOrigin(req)) return error(403, "forbidden_origin");
  await logout(req.cookies.get(SESSION_COOKIE));
  clearSessionCookie(req);
  return json({ ok: true });
}

// ---------- events ----------

const EVENT_ADMIN_COLUMNS = sql`
  e.id, e.title, e.slug, e.description, e.category, e.tags,
  to_char(e.start_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI') AS start_local,
  to_char(e.end_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI') AS end_local,
  e.start_at, e.venue_id, e.organizer_id,
  e.price_min::float8 AS price_min, e.price_max::float8 AS price_max, e.currency, e.is_free,
  e.language, e.beginner_friendly, e.ticket_url, e.source_url, e.image_url,
  e.status, e.origin, e.series_id, e.created_at, e.updated_at,
  e.import_locked, e.review_flags, s.name AS source_name, s.key AS source_key`;

function eventValues(e: EventInput) {
  return sql`
    title = ${e.title}, description = ${e.description}, category = ${e.category}::category,
    tags = ${sql.array(e.tags, "TEXT")},
    start_at = (${e.start_local}::timestamp AT TIME ZONE ${TZ}),
    end_at = (${e.end_local}::timestamp AT TIME ZONE ${TZ}),
    venue_id = ${e.venue_id}, organizer_id = ${e.organizer_id},
    price_min = ${e.price_min}, price_max = ${e.price_max}, currency = ${e.currency},
    is_free = ${e.is_free}, language = ${e.language}::event_language,
    beginner_friendly = ${e.beginner_friendly},
    ticket_url = ${e.ticket_url}, source_url = ${e.source_url}, image_url = ${e.image_url},
    status = ${e.status}::event_status, updated_at = now()`;
}

const listEvents = admin<"/api/admin/events">(async (req) => {
  const p = new URL(req.url).searchParams;
  const status = p.get("status");
  const scope = p.get("scope") ?? "upcoming";
  const q = (p.get("q") ?? "").trim();
  const rows = await sql`
    SELECT e.id, e.title, e.slug, e.category, e.status, e.origin, e.start_at, e.updated_at,
           to_char(e.start_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD"T"HH24:MI') AS start_local,
           v.name AS venue_name, o.name AS organizer_name
    FROM events e
    LEFT JOIN venues v ON v.id = e.venue_id
    LEFT JOIN organizers o ON o.id = e.organizer_id
    WHERE true
      ${status && (STATUSES as readonly string[]).includes(status) ? sql`AND e.status = ${status}::event_status` : sql``}
      ${scope === "upcoming" ? sql`AND coalesce(e.end_at, e.start_at) >= now() - interval '6 hours'` : sql``}
      ${scope === "past" ? sql`AND coalesce(e.end_at, e.start_at) < now()` : sql``}
      ${q ? sql`AND (f_unaccent(lower(e.title)) LIKE '%' || f_unaccent(lower(${q})) || '%'
                 OR f_unaccent(lower(v.name)) LIKE '%' || f_unaccent(lower(${q})) || '%')` : sql``}
    ORDER BY ${scope === "past" ? sql`e.start_at DESC` : sql`e.start_at`}
    LIMIT 500`;
  return json(rows);
});

const createEvent = admin<"/api/admin/events">(async (req) => {
  const e = EventInput.parse(await readJson(req));
  const slug = await uniqueSlug(e.title, e.start_local);
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const [row] = await sql`
    INSERT INTO events (city_id, slug, title, category, start_at, origin)
    VALUES (${city.id}, ${slug}, ${e.title}, ${e.category}::category,
            (${e.start_local}::timestamp AT TIME ZONE ${TZ}), 'MANUAL')
    RETURNING id`;
  await sql`UPDATE events SET ${eventValues(e)} WHERE id = ${row.id}`;
  return json(await getEvent(row.id), { status: 201 });
});

async function getEvent(id: number) {
  const [row] = await sql`
    SELECT ${EVENT_ADMIN_COLUMNS} FROM events e LEFT JOIN sources s ON s.id = e.source_id WHERE e.id = ${id}`;
  if (!row) throw new HttpError(404, "not_found");
  return row;
}

const showEvent = admin<"/api/admin/events/:id">(async (req) => json(await getEvent(parseId(req.params.id))));

const updateEvent = admin<"/api/admin/events/:id">(async (req) => {
  const id = parseId(req.params.id);
  const e = EventInput.parse(await readJson(req));
  const [before] = await sql`SELECT venue_id, review_flags FROM events WHERE id = ${id}`;
  if (!before) throw new HttpError(404, "not_found");
  // An admin edit wins over later imports (import_locked) and settles the review flags.
  await sql`
    UPDATE events SET ${eventValues(e)},
      import_locked = (origin = 'IMPORTED'), review_flags = '{}'
    WHERE id = ${id}`;
  if (e.venue_id && before.review_flags.includes("needs_venue")) await learnVenueAlias(id, e.venue_id);
  return json(await getEvent(id));
});

/**
 * When an admin assigns a venue to an imported event the pipeline couldn't place, remember the
 * source's location text as an alias, so the next import from that source matches by itself.
 */
async function learnVenueAlias(eventId: number, venueId: number) {
  const [item] = await sql`
    SELECT location_text FROM imported_items WHERE event_id = ${eventId} AND location_text IS NOT NULL
    ORDER BY id LIMIT 1`;
  const alias = item?.location_text?.split(",")[0]?.trim().slice(0, 100);
  if (!alias || alias.length < 4) return;
  await sql`
    UPDATE venues SET aliases = array_append(aliases, ${alias}), updated_at = now()
    WHERE id = ${venueId}
      AND f_unaccent(lower(name)) <> f_unaccent(lower(${alias}))
      AND NOT EXISTS (SELECT 1 FROM unnest(aliases) a WHERE f_unaccent(lower(a)) = f_unaccent(lower(${alias})))`;
}

const deleteEvent = admin<"/api/admin/events/:id">(async (req) => {
  const id = parseId(req.params.id);
  await sql`DELETE FROM events WHERE id = ${id}`;
  return json({ ok: true });
});

const setEventStatus = admin<"/api/admin/events/:id/status">(async (req) => {
  const id = parseId(req.params.id);
  const { status } = StatusInput.parse(await readJson(req));
  const res = await sql`
    UPDATE events SET status = ${status}::event_status, review_flags = '{}', updated_at = now()
    WHERE id = ${id} RETURNING id`;
  if (!res.length) throw new HttpError(404, "not_found");
  return json(await getEvent(id));
});

// ---------- venues ----------

async function getVenue(id: number) {
  const [row] = await sql`SELECT * FROM venues WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "not_found");
  return row;
}

function venueValues(v: VenueInput) {
  return sql`
    name = ${v.name}, address = ${v.address}, district = ${v.district}, lat = ${v.lat}, lon = ${v.lon},
    website = ${v.website}, facebook_url = ${v.facebook_url},
    is_approximate_location = ${v.is_approximate_location},
    aliases = ${sql.array(v.aliases, "TEXT")}, updated_at = now()`;
}

const listVenues = admin<"/api/admin/venues">(async () =>
  json(await sql`
    SELECT v.*, (SELECT count(*)::int FROM events e WHERE e.venue_id = v.id) AS event_count
    FROM venues v ORDER BY f_unaccent(lower(v.name))`),
);

const createVenue = admin<"/api/admin/venues">(async (req) => {
  const v = VenueInput.parse(await readJson(req));
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const [row] = await sql`INSERT INTO venues (city_id, name) VALUES (${city.id}, ${v.name}) RETURNING id`;
  await sql`UPDATE venues SET ${venueValues(v)} WHERE id = ${row.id}`;
  return json(await getVenue(row.id), { status: 201 });
});

const showVenue = admin<"/api/admin/venues/:id">(async (req) => json(await getVenue(parseId(req.params.id))));

const updateVenue = admin<"/api/admin/venues/:id">(async (req) => {
  const id = parseId(req.params.id);
  const v = VenueInput.parse(await readJson(req));
  const res = await sql`UPDATE venues SET ${venueValues(v)} WHERE id = ${id} RETURNING id`;
  if (!res.length) throw new HttpError(404, "not_found");
  return json(await getVenue(id));
});

const deleteVenue = admin<"/api/admin/venues/:id">(async (req) => {
  const id = parseId(req.params.id);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM events WHERE venue_id = ${id}`;
  if (n > 0) throw new HttpError(409, "venue_has_events");
  await sql`DELETE FROM venues WHERE id = ${id}`;
  return json({ ok: true });
});

const geocodeHandler = admin<"/api/admin/geocode">(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) throw new HttpError(400, "geocode_query_too_short");
  try {
    return json(await geocode(q));
  } catch (e) {
    console.error("geocode failed", e);
    throw new HttpError(502, "geocode_failed");
  }
});

// ---------- organizers ----------

async function getOrganizer(id: number) {
  const [row] = await sql`SELECT * FROM organizers WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "not_found");
  return row;
}

function organizerValues(o: OrganizerInput) {
  return sql`
    name = ${o.name}, website = ${o.website}, facebook_url = ${o.facebook_url},
    instagram = ${o.instagram}, contact_email = ${o.contact_email}, notes = ${o.notes}, updated_at = now()`;
}

const listOrganizers = admin<"/api/admin/organizers">(async () =>
  json(await sql`
    SELECT o.*, (SELECT count(*)::int FROM events e WHERE e.organizer_id = o.id) AS event_count
    FROM organizers o ORDER BY f_unaccent(lower(o.name))`),
);

const createOrganizer = admin<"/api/admin/organizers">(async (req) => {
  const o = OrganizerInput.parse(await readJson(req));
  const [row] = await sql`INSERT INTO organizers (name) VALUES (${o.name}) RETURNING id`;
  await sql`UPDATE organizers SET ${organizerValues(o)} WHERE id = ${row.id}`;
  return json(await getOrganizer(row.id), { status: 201 });
});

const showOrganizer = admin<"/api/admin/organizers/:id">(async (req) =>
  json(await getOrganizer(parseId(req.params.id))),
);

const updateOrganizer = admin<"/api/admin/organizers/:id">(async (req) => {
  const id = parseId(req.params.id);
  const o = OrganizerInput.parse(await readJson(req));
  const res = await sql`UPDATE organizers SET ${organizerValues(o)} WHERE id = ${id} RETURNING id`;
  if (!res.length) throw new HttpError(404, "not_found");
  return json(await getOrganizer(id));
});

const deleteOrganizer = admin<"/api/admin/organizers/:id">(async (req) => {
  const id = parseId(req.params.id);
  await sql`DELETE FROM organizers WHERE id = ${id}`; // events keep existing (FK SET NULL)
  return json({ ok: true });
});

export const adminRoutes = {
  "/api/admin/login": { POST: postLogin },
  "/api/admin/logout": { POST: postLogout },
  "/api/admin/me": { GET: admin(async (_req, user) => json({ user })) },
  "/api/admin/events": { GET: listEvents, POST: createEvent },
  "/api/admin/events/:id": { GET: showEvent, PUT: updateEvent, DELETE: deleteEvent },
  "/api/admin/events/:id/status": { POST: setEventStatus },
  "/api/admin/venues": { GET: listVenues, POST: createVenue },
  "/api/admin/venues/:id": { GET: showVenue, PUT: updateVenue, DELETE: deleteVenue },
  "/api/admin/organizers": { GET: listOrganizers, POST: createOrganizer },
  "/api/admin/organizers/:id": { GET: showOrganizer, PUT: updateOrganizer, DELETE: deleteOrganizer },
  "/api/admin/geocode": { GET: geocodeHandler },
  "/api/admin/*": () => error(404, "not_found"),
};
