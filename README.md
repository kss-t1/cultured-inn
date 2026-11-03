# cultured-inn

**Kulturalna Karczma** (*The Cultured Inn*): every LARP, improv, tabletop RPG and board game event in Poznań on one map and one calendar.

The product spec is in [DESIGN.md](DESIGN.md), and the planning decisions are in [HANDOFF.md](HANDOFF.md).

## Stack

The stack is **Bun** and **PostgreSQL**, with few dependencies:

- **Bun:** HTTP server, bundler (HTML imports), Postgres client (`Bun.sql`), password hashing, tests.
- **Postgres:** time zones, `pg_trgm` and `unaccent` for search, plain SQL migrations.
- **Frontend:** React, Leaflet with markercluster, plain CSS. The visual design ("Karczma przy świecy") is in `design/`; its tokens and components are `src/site/styles.css`.
- **Validation:** zod.

The code, API and URLs are in English. The UI is in Polish, and every user-facing string lives in `src/shared/i18n/pl.ts`, so an English locale can be added later.

## Local setup

Requires Bun ≥ 1.3 and PostgreSQL ≥ 16 with `postgresql-contrib`.

```sh
# one-time: a login role for your user, plus dev and test databases
sudo -u postgres psql -c "CREATE ROLE $USER LOGIN CREATEDB PASSWORD 'karczma-dev'"
createdb karczma && createdb karczma_test

cp .env.example .env            # adjust DATABASE_URL if your role/password differ
bun install
bun run db:migrate
bun run db:seed                 # venues, organizers, import sources
bun run jobs:imports --all      # import real events now (poznan.pl takes ~7 min)
bun run admin:create you@example.com
bun run dev                     # http://localhost:3000, admin at /admin
```

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Dev server with HMR |
| `bun test` | Tests against `TEST_DATABASE_URL`, which must be a `*_test` database because tests wipe it |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run db:migrate` | Apply `db/migrations/*.sql` in order |
| `bun run verify` | Typecheck, tests and build in one chain. The pre-push hook in `.githooks/` runs it; `bun install` enables the hook |
| `bun run db:seed` | Seed venues, organizers and import sources. Existing rows are left alone |
| `bun run jobs:imports [--all \| <key>…]` | Run import sources: the due ones, all of them, or the named ones (e.g. `druga-era-ics`) |
| `bun run admin:create <email>` | Create an admin, or reset their password. The password comes from `ADMIN_PASSWORD` or a prompt |
| `bun run build` | Compile a single executable to `dist/karczma` |

## Layout

```
src/server.ts          Bun.serve routes (SPAs via HTML imports, APIs, SSR event pages)
src/routes/            public.ts (/api/events, /events/:slug[.ics]), submit.ts (/api/submit), admin.ts (/api/admin/*)
src/lib/               events queries, auth, ICS export, geocoding, HTTP helpers
src/importers/         import pipeline (pipeline.ts), runner (run.ts) and adapters/ (ics, jsonld, poznanPl, facebook)
src/jobs/              in-process scheduler
src/shared/            code shared by client and server: filters, schemas, categories, i18n, formatting
src/site/              public SPA (list, map, calendar) and the /submit form
src/admin/             admin SPA
db/migrations/         numbered SQL migrations; db/migrate.ts applies them
tests/                 bun test
```

## Importing events

Sources live in the `sources` table and are managed at **/admin/sources**. `bun run db:seed` adds the initial set:

| Source | Kind |
|---|---|
| Klub Fantastyki Druga Era (public Google Calendar) | ICS |
| poznan.pl city culture calendar | `poznan_pl` adapter, keyword-filtered |
| Meetup "PlayZone Poznań" | ICS |
| Biletyna Poznań: comedy, theatre, stand-up | JSON-LD, keyword-filtered |
| Facebook Pages: Larpunk, La Vida Impro, Larpowy Ogród, Wargamer Poznań, Cooliozum, Podziemie | FB_PAGE |
| Facebook Pages of Poznań impro groups: DPR, Improsi, Leniwe Raz, Czwórka na Szynach, Improłaki, Rymparzyści | FB_PAGE |

Each run goes through the same pipeline (`src/importers/pipeline.ts`):

1. **Classify:** per-source `rules` first (regex → category and tags, or `skip`), then the keyword rules in `src/shared/categories.ts`, then the source's default category. With `requireMatch`, items that match nothing are dropped.
2. **Filter:** out-of-area items (coordinates more than 30 km away, or a postcode outside 60–62) and past items are dropped.
3. **Match the venue:** by name, alias or street address in the location text, then by coordinates within 75 m. Places with coordinates become new venues automatically. Otherwise the event gets the `needs_venue` flag. When an admin picks a venue for it, the source's location text is saved as an alias.
4. **Dedupe:** `(source, external_id)` identifies an item across runs. A new item that starts within ±90 min of an existing event at the same venue, with a title similarity of 0.6 or more (`pg_trgm`), is linked to that event instead of creating a new one.
5. **Upsert:** the price comes from the source's data, else from a price in the title or description (`20 zł`, `31pln`). With no price anywhere the event is stored as free, unless it has a ticket link. Only the source that created an event updates it. Once an admin edits an imported event, imports stop overwriting it and flag `changed_at_source` instead.
6. **Publish:** imported events are published right away (`AUTO_PUBLISH`, the default for every source). **/admin/review** lists what was imported in the last 7 days, problems first (no venue, guessed category, changed or gone at the source), so mistakes can be fixed, merged or hidden. A source set to `REVIEW` keeps its new events as `DRAFT` there instead.
7. **Disappearance:** sources that return a complete listing (ICS, poznan.pl) flag upcoming events that vanished with `missing_from_source`. Nothing is deleted.

Recurring ICS events are expanded 60 days ahead (`rrule`), keyed by local date, so moving one session to a different hour updates it instead of duplicating it.

**Facebook.** Meta's API no longer exposes public events, so the importer reads public pages without logging in:

- **Event pages** (`facebook.com/events/<id>`) embed the event as JSON. Admins can paste such a link in **/admin/review → Import from URL**, and imported Facebook events are re-checked on every run, which picks up time changes and cancellations.
- **A Page's `upcoming_hosted_events` tab** lists the first few events for many Pages. Others show a login wall, and for those the importer can fall back to the paid [Apify Facebook Events Scraper](https://apify.com/apify/facebook-events-scraper) when `APIFY_TOKEN` is set. Set `"provider": "apify"` or `"direct"` in a source's config to force one method. Apify bills per event (about $0.007) and also returns past events, so it fetches 10 per run by default (`"maxEvents"` in the config changes that) and the seeded login-wall Pages run every 3 days.
- Requests are limited to one every 4 seconds.

**Scheduler.** In production the server checks every 10 minutes for sources whose interval has passed. Each source run holds a Postgres advisory lock, so the scheduler, **Run now** and the CLI never run the same source twice. poznan.pl asks for 10 seconds between requests (robots.txt), so a 30-day sync takes about 7 minutes and runs daily.

## Public API

`GET /api/events` returns `{ events: PublicEvent[] }`. It only includes `PUBLISHED` events that overlap the selected window. All parameters are optional:

| Param | Values |
|---|---|
| `when` | `month` (default, from now until the end of the month) · `today` (from now) · `tomorrow` · `weekend` (Fri 17:00 to Sun) · `week` (until Sunday) |
| `from`, `to` | `YYYY-MM-DD`, inclusive, Europe/Warsaw; overrides `when`. `from` alone is a single day |
| `cat` | comma list of `larp,impro,rpg,boardgames` |
| `tags` | comma list; an event must have all of them |
| `free`, `beginner`, `multiday` | `1` |
| `lang` | `en` (events in English or bilingual) |
| `time` | `evening` (starting at 17:00 or later) · `day` |
| `priceMax` | number in PLN |
| `bbox` | `minLon,minLat,maxLon,maxLat` |
| `q` | free text: title, description, venue, organizer; ignores diacritics, matches prefixes, tolerates typos |

`POST /api/submit` takes the public **Zgłoś wydarzenie** form (`/submit`, fields in `SubmitInput`, `src/shared/schemas.ts`). It needs an allowed `Origin`, ignores submissions that fill the hidden `website` field, and accepts at most 5 per IP per hour (`429 rate_limited`). Each submission becomes a `DRAFT` flagged `submitted` that waits on the review page; the location text and contact are kept in `submissions` for admins. Behind a reverse proxy set `TRUST_PROXY=1`, or every visitor counts as the proxy's IP and shares one limit.

API errors look like `{ "error": "<code>", "fields": { "<field>": "<code>" } }`. The UI translates the codes.

## Deployment

The public site runs on a free Oracle Cloud VM behind Caddy, with a DuckDNS domain. Setup, shipping updates, logs and backups: [DEPLOY.md](DEPLOY.md).

## License

MIT, see [LICENSE](LICENSE).
