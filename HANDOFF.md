# Handoff: Kulturalna Karczma (implementation pickup)

Written 2026-11-03 at the end of a planning session. **Read `DESIGN.md` in this folder first**; it's the full MVP spec. This file adds the decisions, the user's preferences and the current state.

---

## 1. What we're building
A public web app that collects **LARP, improv (impro), tabletop RPG and board game events in Poznań** and shows them on a **map**, a **calendar** and a **list**, with fast filters. The goal: "I have a free evening, what can I do tonight?" answered in under a minute.

- A **password-protected admin panel** for adding, editing and approving events and for managing venues, organizers and sources.
- **Automatic event import** from external sources into a review queue: ICS feeds, JSON-LD, per-site HTML scrapers, LLM extraction, and Facebook through admin "import from URL". See DESIGN.md §5 for the source list and the Facebook caveats.
- **v2, not now:** user accounts, "looking for players" open sessions, player win-rate stats, BG Stats import, and "pleasantness" ratings. If ratings ever get built, prefer a no-show/reliability score, private "would play again" marks and vouching over public ratings of people, because of GDPR and toxicity risks.

## 2. Decisions made with the user
| Topic | Decision |
|---|---|
| Scope of MVP | 4 categories: LARP, IMPRO, RPG, BOARDGAMES. Poznań only (the data model carries `city` for later). |
| Name | **Kulturalna Karczma** is the Polish main brand; "karczma" is the short name. The repo and package are named `cultured-inn`. **The Cultured Inn** is the English name. Pun: *kulturalny* means both "cultural" and "well-mannered". Tagline: "gdzie gra się kulturalnie" / "where everyone plays nice". The user liked both names; neither is formally confirmed. `sidequest.pl` was rejected because a Gdańsk game shop uses it. |
| Stack | **TypeScript on Bun + PostgreSQL, minimal dependencies.** The user rejected Python/Django, then rejected Next.js + Payload + Tailwind and similar. Use Bun built-ins wherever possible: `Bun.serve` routes, HTML imports for bundling, `Bun.sql`, `Bun.password`, `req.cookies`, `HTMLRewriter`, `bun test`, `bun build --compile`. Use Postgres features (`pg_trgm`, `unaccent`, `timestamptz` / `AT TIME ZONE`, `jsonb`, `text[]`, advisory locks) instead of libraries. |
| Allowed dependencies | `react`, `react-dom`, `leaflet` + `leaflet.markercluster`, `@fullcalendar/react` (+ daygrid/timegrid/list), `zod`, `rrule`, `node-ical`, `@anthropic-ai/sdk` (model `claude-haiku-5-5`). **Plain CSS** (no Tailwind), plain `URLSearchParams`, **no ORM** (plain SQL migrations plus a small migrate script). Justify anything new before adding it. |
| Admin | Hand-built small React SPA at `/admin` with a JSON API `/api/admin/*`. argon2id via `Bun.password`, sessions in Postgres, HttpOnly/Secure/SameSite=Strict cookie, login lockout, Origin-header CSRF check, admin users created from the CLI only. |
| Hosting (planned) | VPS: one compiled Bun binary under systemd, Postgres, Caddy for HTTPS, nightly `pg_dump`. |
| License | **MIT**, already in the repo (`LICENSE`, © 2026 Krzysztof Spisak-Spisacki). The user picked it when creating the GitHub repo, although AGPL-3.0 had been recommended. Don't change it. A `TRADEMARKS.md` (forks must rename) was suggested and is still worth proposing. |

## 3. Still open (ask the user when relevant, don't guess)
1. **Facebook:** admin "import from URL" plus organizer ICS feeds only, or also a paid Apify scraper behind a feature flag (against Facebook's ToS, so a risk the user would be accepting)?
2. **Auto-publish:** which sources skip the review queue?
3. **UI language:** Polish only at launch, or Polish and English (Poznań has many international students)?
4. Domains look unregistered (DNS check only, not WHOIS): `kulturalnakarczma.pl`, `theculturedinn.com`, `karczma.app`. The user should register them.

## 4. User preferences
- Wants direct recommendations, not long lists of options.
- Strongly prefers few technologies and Bun-native solutions.
- Polish speaker, based in Poznań, active in the local LARP and improv scene, so they have personal contacts with organizers. That's the go-to-market advantage.
- Commit and push only when asked. Work on a feature branch rather than committing straight to `main`.

## 5. Current state of `/home/kss/coding/cultured-inn`
- A git checkout of `git@github.com:kss-t1/cultured-inn.git`, branch `main`, one "Initial commit".
- Already in the repo: `LICENSE` (MIT), `README.md` (a stub: "Nerd culture events aggregator"; expand it during M1), and `.gitignore` (GitHub's Node template, which already ignores `node_modules/` and `.env*`).
  - **Watch out:** the `.env.*` rule also ignores `.env.example`. Add `!.env.example`.
- `DESIGN.md` and `HANDOFF.md` were copied here from a planning session in `/home/kss/coding/t1` and are **not committed yet**.
- **No code yet.** **Bun and PostgreSQL are not installed**; only Python 3.14 is. The user needs to run:
  - `curl -fsSL https://bun.sh/install | bash`
  - `sudo apt install postgresql postgresql-contrib` (contrib is needed for `pg_trgm` and `unaccent`)
  - then create a database `karczma` and a role for it.

## 6. Next step: Milestone M1 (about 1.5 weeks of work)
Goal: a deployed site with manual event entry, before any scraping.

1. **Scaffold:** `package.json` (name `cultured-inn`; scripts: `dev`, `build`, `start`, `test`, `db:migrate`, `admin:create`), `tsconfig.json`, `bunfig.toml`, `.env.example` (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `PUBLIC_BASE_URL`), and an update to the existing `.gitignore`.
2. **DB:** `db/migrations/001_init.sql` with the tables from DESIGN.md §3 (cities, venues, organizers, events, event_series, sources, imported_items, admin_users, admin_sessions, login_attempts) and `002_extensions.sql` (`pg_trgm`, `unaccent`, plus GIN indexes). Also `db/migrate.ts`. Seed Poznań and a few real venues (Gosu, ParaDice, Kosteczka; geocode them through Nominatim and verify the addresses).
3. **Server:** `src/server.ts` with `Bun.serve({ routes })`, HTML imports for `site/index.html` and `admin/index.html`, and `development: true` for HMR in dev.
4. **Public API:** `GET /api/events?from&to&cat&tags&free&lang&evening&bbox&q`. Calculate date ranges in SQL with Europe/Warsaw time. Return only `PUBLISHED` events.
5. **Public SPA:**
   - chips for Dziś / Jutro / Ten weekend / Ten tydzień / pick a day
   - category chips with colors
   - side-by-side list and map on desktop; Mapa / Lista / Kalendarz tabs on mobile
   - Leaflet with clustering and one pin per venue
   - FullCalendar, using the list view on mobile
   - all filter state kept in the URL
6. **Event page:** `GET /wydarzenia/:slug`, rendered on the server with `react-dom/server`, including schema.org Event JSON-LD and an `.ics` download.
7. **Admin:** login and logout, CRUD for events, venues and organizers, venue geocode button, status changes (DRAFT / PUBLISHED / HIDDEN / CANCELLED). The review queue UI can wait until M2.
8. **Tests** (`bun test`): filter parsing, date-range SQL (today, weekend, evening; check the DST boundary), auth (lockout, origin check).
9. **Accessibility and layout:** must work at phone width; follow Polish UI conventions.

Then M2 (import pipeline, ICS and JSON-LD adapters, review queue, dedupe, recurring series, `/feed.ics`) and M3 (site adapters, LLM URL import, public submit form). See DESIGN.md §7.
