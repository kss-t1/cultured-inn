# cultured-inn

**Kulturalna Karczma** (*The Cultured Inn*): every LARP, improv, tabletop RPG and board game event in Poznań on one map and one calendar.

The product spec is in [DESIGN.md](DESIGN.md), and the planning decisions are in [HANDOFF.md](HANDOFF.md).

## Stack

The stack is **Bun** and **PostgreSQL**, with few dependencies:

- **Bun:** HTTP server, bundler (HTML imports), Postgres client (`Bun.sql`), password hashing, tests.
- **Postgres:** time zones, `pg_trgm` and `unaccent` for search, plain SQL migrations.
- **Frontend:** React, Leaflet with markercluster, FullCalendar v7, plain CSS.
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
bun run db:seed --demo          # known venues + a few [DEMO] events around today
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
| `bun run db:seed [--demo]` | Seed venues (and demo events) |
| `bun run admin:create <email>` | Create an admin, or reset their password. The password comes from `ADMIN_PASSWORD` or a prompt |
| `bun run build` | Compile a single executable to `dist/karczma` |

## Layout

```
src/server.ts          Bun.serve routes (SPAs via HTML imports, APIs, SSR event pages)
src/routes/            public.ts (/api/events, /events/:slug[.ics]), admin.ts (/api/admin/*)
src/lib/               events queries, auth, ICS export, geocoding, HTTP helpers
src/shared/            code shared by client and server: filters, schemas, categories, i18n, formatting
src/site/              public SPA (list, map, calendar)
src/admin/             admin SPA
db/migrations/         numbered SQL migrations; db/migrate.ts applies them
tests/                 bun test
```

## Public API

`GET /api/events` returns `{ events: PublicEvent[] }`. It only includes `PUBLISHED` events that overlap the selected window. All parameters are optional:

| Param | Values |
|---|---|
| `when` | `today` (default, from now) · `tomorrow` · `weekend` (Fri 17:00 to Sun) · `week` (until Sunday) |
| `from`, `to` | `YYYY-MM-DD`, inclusive, Europe/Warsaw; overrides `when` |
| `cat` | comma list of `larp,impro,rpg,boardgames` |
| `tags` | comma list; an event must have all of them |
| `free`, `beginner`, `multiday` | `1` |
| `lang` | `en` (events in English or bilingual) |
| `time` | `evening` (starting at 17:00 or later) · `day` |
| `priceMax` | number in PLN |
| `bbox` | `minLon,minLat,maxLon,maxLat` |
| `q` | free text: title, description, venue, organizer; ignores diacritics, matches prefixes, tolerates typos |

Admin API errors look like `{ "error": "<code>", "fields": { "<field>": "<code>" } }`. The UI translates the codes.

## Deployment (planned)

1. `bun run build` produces one binary.
2. Copy it and `db/migrations/` to the VPS and run `bun db/migrate.ts`, or run migrations from a checkout.
3. Run the binary under systemd with `NODE_ENV=production`, `TRUST_PROXY=1`, `PUBLIC_BASE_URL=https://…` and a long `SESSION_SECRET`.
4. Put Caddy in front for HTTPS and security headers, for example:

```
kulturalnakarczma.pl {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
  reverse_proxy 127.0.0.1:3000
}
```

## License

MIT, see [LICENSE](LICENSE).
