# Kulturalna Karczma: MVP design

> Every LARP, improv, tabletop RPG and board game event in Poznań, on one map and one calendar.
> Goal: on a free evening, find something to do in under a minute.

Status: draft v0.1 (2026-11-03)

---

## 1. Scope

### In the MVP
- **Four categories:** LARP, Impro, RPG, Planszówki (board games).
- **Public site**, no user accounts: a map view, a calendar view, a list view, filters, and an event detail page.
- **Admin panel** behind a password: add, edit, approve and hide events; manage venues, organizers and sources.
- **Automatic import** from external sources into a review queue.
- **Poznań only**, with a Polish UI that is ready for an English translation.

### Not in the MVP (on purpose)
- User accounts, RSVPs, the open-session or looking-for-players feature, player ratings, and stats or BG Stats import. These come in v2, once people use the site.
- Other cities. The data model already supports them through `city`, but the UI does not.
- A native mobile app. The MVP is a mobile-first responsive web app, optionally installable as a PWA later.

---

## 2. User experience

### The main flow: "I have a free evening"
1. Open the site. It defaults to **Ten miesiąc** (this month), events from now until the end of the month, so the map isn't empty on quiet days.
2. Pick a time with quick chips: `Dziś` · `Jutro` · `Ten weekend` · `Ten tydzień` · `Ten miesiąc`, or dates in `Od` … `Do` (only `Od` = that single day).
3. Pick categories by tapping chips: `LARP` `Impro` `RPG` `Planszówki`. Each one has its own color, used everywhere.
4. See the results as a **list and a map side by side** on desktop, or switch between **Mapa / Lista / Kalendarz** tabs on mobile.
5. Tap an event to open a card with the time, place, price, a "Dla początkujących" (beginner-friendly) badge, and the ticket or source link.
6. Use **Dodaj do kalendarza** (add to calendar, as an `.ics` download) or **Udostępnij** (share). Sharing uses a link that keeps the filters.

### Views
| View | Contents |
|---|---|
| **Mapa** | Leaflet with OpenStreetMap tiles. Pins are colored by category and cluster when zoomed out. "Near me" uses browser geolocation. Several events at one venue share one pin, and the popup lists them. |
| **Kalendarz** | FullCalendar with month, week and day modes and category colors. On mobile the default is a **list-by-day** mode, because a month grid is unreadable on a phone. |
| **Lista** | Events grouped by day and sorted by start time. This is the fastest view for "what's on tonight". |
| **Event detail** | Title, category, date and time, venue with a small map, price, organizer, description, tags, ticket link, source link, and "last updated". Includes schema.org `Event` JSON-LD for SEO. |

### Filters
All filters are stored in **URL query params**, so any filtered view can be shared or bookmarked.

- **Kiedy** (when): the quick chips above, or a date range.
- **Pora** (time of day): any, daytime, or evening (starting at 17:00 or later).
- **Kategoria** (category): multi-select of the four.
- **Tagi** (tags): `dla początkujących` (for beginners), `za darmo` (free), `po angielsku` (in English), `jednorazowe vs cykliczne` (one-off vs recurring), `wielodniowe` (multi-day).
- **Cena max** (max price): a slider.
- **Odległość** (distance): from the user's location, or a district.
- **Search**: free text over the title, description, venue and organizer.

### Extra
- **iCal subscription per filter.** For example, `/feed.ics?cat=larp,impro` lets someone subscribe to "all LARP and improv events" in Google or Apple Calendar. This is cheap to build and very sticky.

---

## 3. Data model

```
City            id, name, slug, lat, lon, timezone          (one row for now: Poznań)

Category        LARP | IMPRO | RPG | BOARDGAMES             (enum, plus color and icon)

Venue           id, city, name, address, district,
                lat, lon, website, facebook_url,
                is_approximate_location (bool)               (for private homes, later)
                aliases[]                                    ("Gosu", "Gosu Pub" → same venue)

Organizer       id, name, website, facebook_url, instagram,
                contact_email (admin-only), notes

Event           id, title, slug, description (markdown),
                category, tags[],
                start_at, end_at (tz-aware, Europe/Warsaw),
                venue (FK, nullable for "online/TBA"),
                organizer (FK, nullable),
                price_min, price_max, currency, is_free,
                language (pl/en/both),
                beginner_friendly (bool),
                ticket_url, source_url, image_url,
                status: DRAFT | PUBLISHED | HIDDEN | CANCELLED,
                origin: MANUAL | IMPORTED,
                series (FK, nullable),                       (recurring events)
                created_at, updated_at, last_seen_at

EventSeries     id, title, rrule (RFC 5545), template fields  (e.g. "every Tuesday: board game night at X")
                → a nightly job creates Event rows 60 days ahead

Source          id, name, kind (ICS | JSONLD | HTML_ADAPTER | FB_PAGE | MANUAL_URL | LLM_PAGE),
                url, adapter_name, config (JSON),
                default_category, default_venue, default_organizer,
                trust: AUTO_PUBLISH | REVIEW,
                enabled, schedule (e.g. every 6h),
                last_run_at, last_status, last_error, events_found

ImportedItem    id, source, external_id, content_hash, raw (JSON),
                event (FK, nullable), first_seen_at, last_seen_at
                unique(source, external_id)
```

Notes:
- Single-occurrence `Event` rows make filtering, the map and the calendar trivial. Recurring events are expanded by a nightly job instead of being calculated when a page loads.
- `ImportedItem` keeps the raw payload. Re-imports update an existing event instead of duplicating it, and admins can see exactly what the scraper saw.

---

## 4. Admin panel

A small React app at `/admin`, served by the same Bun server and talking to a JSON API under `/api/admin/*`. It's hand-built but narrow: a few tables and forms.

- **Auth:**
  - `admin_users` table with passwords hashed by **`Bun.password`** (argon2id)
  - `admin_sessions` table in Postgres; the session id goes in an `HttpOnly; Secure; SameSite=Strict` cookie, read and written with Bun's built-in cookie API (`req.cookies`)
  - login lockout: 5 failed attempts per IP or user in 15 minutes, counted in Postgres
  - a CSRF check: mutating requests must carry a matching `Origin` header
  - HTTPS only; admin users are created from the CLI (`bun run admin:create`), with no signup page
  - TOTP 2FA can be added later
- **Event editor:** all fields, a venue picker with an autocomplete and **"+ new venue"**, and a geocoding button that fills `lat` and `lon` from the address through Nominatim. Includes a small map preview.
- **Review queue:** a filtered list of `DRAFT` imported events, with bulk **Publish / Hide / Merge into...** actions. It shows possible duplicates beside each item.
- **Import from URL:** paste any link (a Facebook event, an ebilet page, a venue page) and get a pre-filled draft. This uses the adapters from section 5 and falls back to LLM extraction.
- **Sources:** list sources with their health (last run, error, number of events), **Run now**, and enable or disable.
- **Recurring series:** define them once ("every Thursday 18:00 RPG at X") and the occurrences generate automatically.

---

## 5. Automatic import

### Pipeline
```
 fetch (adapter) → normalize → classify → geocode/match venue → dedupe → upsert → (auto-publish | review queue)
```

1. **Fetch.** Each source has an adapter that returns `EventCandidate` objects (title, start, end, location text, url, price, raw).
2. **Normalize.** Convert to Europe/Warsaw time, clean up HTML, and parse prices such as "25 zł" or "wstęp wolny" (free entry).
3. **Classify.** Use the source's default category if it has one. Otherwise apply keyword rules, for example:
   - `larp|larpow` → LARP
   - `impro|improwiz` → IMPRO
   - `rpg|sesja|d&d|dnd|one-shot|warhammer fantasy roleplay|zew cthulhu` → RPG
   - `planszów|board game|gry planszowe` → BOARDGAMES

   Events from broad sources that match **no** keyword are dropped. Ambiguous ones go to the review queue.
4. **Match the venue.** Look up the venue by name or alias, otherwise by geocoded address, otherwise mark it "needs venue" in the review queue.
5. **Dedupe:**
   - same `(source, external_id)` means an update
   - otherwise, the same venue plus a start time within ±90 min plus a title similarity of 0.6 or more (Postgres `pg_trgm` `similarity()`, threshold to be tuned) means a probable duplicate, which is merged with a reference to the first source
6. **Publish policy.** Decided 2026-11-03: every source is `AUTO_PUBLISH` by default, and the review page is used to fix mistakes after publishing (it lists the last 7 days of imports, flagged ones first). `REVIEW` remains available per source.
7. **Disappearance.** If an event vanishes from its source before it starts, flag it for review. Do not delete it automatically, because it may have been cancelled.

### Adapter types (most of the work is reusable generic code)
| Adapter | Covers | Effort |
|---|---|---|
| **ICS** (generic) | Any public Google, Outlook or Apple calendar, and WordPress "The Events Calendar" sites (`?ical=1`) | Low. **Build first.** |
| **JSON-LD** (generic) | Any page with schema.org `Event` markup (many ticketing sites, Eventbrite, Meetup and WordPress sites) | Low |
| **HTML adapter** (per site) | Sites without structured data | Medium per site; these break when the site changes |
| **LLM page extractor** | Messy pages, Facebook event pages, Discord or Instagram post text: text goes in, `EventCandidate` JSON comes out (Claude Haiku, `claude-haiku-5-5`) | Low to build, cents per page. Always sent to `REVIEW`. |

### Sources: what exists and how to use it

**Facebook (the most important, and the most difficult)**
- The official Graph API only returns events for pages **you** manage. It cannot read other organizers' events.
- Scraping is **against Facebook's terms of service**, logged-out views are limited (vendors mention about 8 events per page), and it breaks often. Open-source (`facebook-event-scraper` on npm) and paid (Apify actors, ScrapeCreators) scrapers exist.
- **Recommended for the MVP:**
  1. **Import from URL** in the admin. A human pastes a Facebook event link and the system fetches that one public page (OpenGraph tags plus the LLM extractor) to make a draft. This is low-volume and human-triggered.
  2. **Ask organizers for an ICS feed.** Many already keep a Google Calendar, which is the cleanest option.
  3. *Optional, risk accepted knowingly:* a paid Apify actor that runs daily over a list of about 30 organizer page URLs, with results going to `REVIEW`. Keep it behind a feature flag so it can be turned off easily.

**Generic Poznań culture listings** (filtered with the keyword rules)
- **kultura.poznan.pl**, the city culture portal. Pyrkon is listed there. It has a calendar with per-day pages (`/events/YYYY-MM-DD/`) and categories (Spectacle, Meeting, Festival...), but no visible RSS, iCal or API. Use an HTML adapter that crawls the next 30 days. Useful for improv shows and festivals.
- **Odkryj Kulturę** (gov.pl), the Ministry of Culture's national event search with city filters. *Check whether it has an API or structured data.*

**Ticketing platforms** (mostly for improv shows; search "impro" + Poznań)
- **ebilet.pl** (has a Poznań city page), **Going.** (goingapp.pl, no public API found), **Biletyna**, **Kupbilecik**, **Fever** (has a Poznań "games & activities" section). Try the JSON-LD adapter first and fall back to HTML adapters.

**Board games and card games**
- Poznań game cafés: **Gosu, ParaDice, Kosteczka** (from the Planszowy Gram Prix top 10), plus local game shops. Check each website for an iCal or events page. If there isn't one, use their Facebook pages through "import from URL", or have them added as recurring series.
- **Wizards Store & Event Locator** (locator.wizards.com): Magic and D&D events in Poznań stores. It has no official API; an undocumented endpoint exists and is used by community bots. *Phase 2*, mostly relevant if card games are added.

**RPG and LARP**
- **Klub Fantastyki "Druga Era"**, the organizers of Pyrkon, who also run RPG sessions. Check their site and Facebook page.
- **Pyrkon** (around June each year, MTP Poznań), with a large program of LARP, RPG and board games. Import the convention as a multi-day event and optionally its program blocks. Check whether the program has a feed.
- **Discord servers** of local RPG and LARP communities. *Phase 2:* a bot that reads announcement channels (only with server owners' permission) and passes the text through the LLM extractor into review.
- **Meetup** group pages. Few Poznań groups in these hobbies, but the JSON-LD adapter covers them if any exist.

**Conventions (national, for a "Konwenty" strip)**
- Pyrkon (Poznań), Warsaw Fantasy & Magic Con, Summer Fantasy Fair Gdańsk, MFKiG Łódź, Bykon (Bydgoszcz), and Polcon. These are entered by hand in the admin, about 20 a year, so no scraper is needed.

**Instagram:** no realistic API or scraping route, so use manual or URL import.

> The most valuable source will be **organizers adding their own events**. MVP: a public **"Zgłoś wydarzenie"** (submit an event) form that creates a `DRAFT`, with a honeypot and rate limiting. Later: organizer accounts.

### Scraping etiquette
- Send a clear User-Agent with a contact URL, respect `robots.txt`, rate-limit to at most 1 request per second per host, and cache responses.
- Link back to the source, show a short description rather than a full copy, and remove events promptly if an organizer asks.

---

## 6. Tech stack

**Bun + Postgres, and as little else as possible.** Bun is the runtime, HTTP server, bundler, Postgres client, password hasher, test runner and package manager in one binary, and Postgres covers search, fuzzy matching, timezones and job locking. Requires **Bun 1.3+** and **PostgreSQL 16+**; neither is installed on this machine yet.

### What Bun covers
| Need | Bun built-in | Replaces |
|---|---|---|
| HTTP server + routing | **`Bun.serve({ routes })`** with typed route params | Express / Hono / Next.js |
| Frontend bundling + dev HMR | **HTML imports** in `Bun.serve` (`import site from "./site/index.html"`), which bundle TSX and CSS automatically; `bun build` for production | Vite / webpack |
| Postgres client | **`Bun.sql`** (tagged templates, pooling, transactions) | `pg` / postgres.js / an ORM |
| Password hashing | **`Bun.password`** (argon2id) | bcrypt / argon2 packages |
| Cookies | **`req.cookies`** (`CookieMap`) | cookie libraries |
| HTML parsing for scrapers | **`HTMLRewriter`** (streaming CSS-selector parser; also extracts JSON-LD `<script>` blocks) | cheerio |
| Tests | **`bun test`** | Vitest / Jest |
| Env, TS, file I/O | `.env` loaded automatically, TypeScript runs directly, `Bun.file` / `Bun.write` | dotenv, tsx, fs-extra |
| Deployment artifact | **`bun build --compile`**: one self-contained executable | Docker image / node_modules on the server |

### What Postgres covers
| Need | Postgres feature |
|---|---|
| "Today", "this weekend", evening filter | `timestamptz` + `AT TIME ZONE 'Europe/Warsaw'`: date ranges calculated in SQL, so no date library is needed |
| Duplicate detection | `pg_trgm` `similarity()` on titles, with a GIN trigram index |
| Search | full-text search with `unaccent` and the `simple` config (Postgres has no built-in Polish dictionary), plus a trigram fallback for typos |
| Tags, venue aliases | `text[]` columns with GIN indexes |
| Raw imported payloads | `jsonb` |
| Map viewport filter | `lat`/`lon` columns with a B-tree index and a bounding-box `WHERE`; move to PostGIS only if needed |
| Scheduled jobs that don't overlap | `pg_try_advisory_lock` per job |
| Sessions, login lockout | plain tables |

### The few remaining dependencies
| Package | Why it can't be built in |
|---|---|
| `react`, `react-dom` | public site and admin UI; `react-dom/server` also renders the event detail pages on the server for SEO |
| `leaflet` + `leaflet.markercluster` | the map |
| `@fullcalendar/react` (+ daygrid, timegrid, list) | the calendar |
| `zod` | one schema for scraper output, LLM JSON, the submit form and admin forms |
| `rrule` | expanding recurring series (RFC 5545 rules are easy to get wrong by hand) |
| `node-ical` | parsing external ICS feeds (timezones and recurrence inside ICS are tricky). Exporting ICS is simple text and is hand-written. |
| `@anthropic-ai/sdk` | LLM extraction with `claude-haiku-5-5`, output checked with zod |

Styling is **plain CSS** with custom properties for category colors and light/dark themes, so there's no CSS framework. URL state uses plain `URLSearchParams`. Geocoding uses Nominatim through `fetch` (at most 1 request per second, cached per venue).

### Runtime shape
- **One Bun process** serves:
  - the public site (`/`)
  - server-rendered event pages (`/wydarzenia/:slug`)
  - `/feed.ics`
  - the public API (`/api/events?…`)
  - the admin SPA and its API (`/admin`, `/api/admin/*`)
- **Scheduler inside the same process:** a small loop runs `runImports` every 6 hours and `expandSeries` nightly. Each job takes a Postgres advisory lock first, so a second instance or a manual CLI run (`bun run jobs:imports`) never runs a job twice.
- **Migrations:** numbered `.sql` files in `db/migrations/`, applied by a ~40-line script (`bun run db:migrate`) that records them in a `schema_migrations` table. No ORM; queries are typed by hand next to zod schemas.

### Hosting
A small VPS (Hetzner, or a Polish provider such as mikr.us) with Postgres installed, the compiled `karczma` binary run by systemd, and Caddy in front for automatic HTTPS. A few euros a month. Back up with `pg_dump` every night to off-site storage.

Analytics: Plausible or Umami (cookie-free), so no cookie banner is needed.

### Project layout
```
karczma/
  package.json  tsconfig.json  bunfig.toml  .env.example
  src/
    server.ts                 Bun.serve: routes, HTML imports, scheduler start
    db.ts                     Bun.sql instance
    routes/
      public.ts               /api/events, /feed.ics, /wydarzenia/:slug (SSR), /api/submit
      admin.ts                /api/admin/* (events, venues, organizers, sources, review queue)
      auth.ts                 login/logout, sessions, lockout, origin check
    site/                     public SPA
      index.html  main.tsx  styles.css
      components/             FilterBar, EventList, EventMap, EventCalendar, EventCard
    admin/                    admin SPA
      index.html  main.tsx  ...
    shared/
      schemas.ts              zod: Event, Venue, EventCandidate, filters
      categories.ts           enum, colors, keyword rules
      filters.ts              URLSearchParams ↔ filter object (shared by client and server)
    importers/
      types.ts                Adapter interface
      adapters/               ics.ts, jsonld.ts, llm.ts, kulturaPoznan.ts, ebilet.ts, ...
      pipeline.ts             normalize, classify, venue match, dedupe (pg_trgm), upsert
    jobs/
      scheduler.ts            interval loop + advisory locks
      runImports.ts  expandSeries.ts
  db/
    migrations/               001_init.sql, 002_trgm.sql, ...
    migrate.ts
  scripts/
    createAdmin.ts
  tests/
    fixtures/                 saved HTML/ICS per adapter
    *.test.ts                 bun test
```

---

## 7. Milestones

| # | Deliverable | Rough size |
|---|---|---|
| **M1** | Bun server + Postgres schema and migrations, admin auth and CRUD, manual event entry, public list, map and calendar with filters, event page, deployed | ~1 week |
| **M2** | Import pipeline, ICS and JSON-LD adapters, review queue, dedupe, recurring series, `.ics` export and feeds | ~1 week |
| **M3** | Site adapters (kultura.poznan.pl, ebilet, Going, Biletyna), "import from URL" with the LLM extractor (including Facebook links), public submit form | ~1–2 weeks |
| **M4** | Launch prep: seed 15–20 organizers and venues, collect their ICS feeds, add about 60 days of events, SEO, PWA manifest, announce in Poznań Facebook and Discord groups | ongoing |

**Launch bar:** at least **15 upcoming events in any given week** across the four categories. An empty calendar kills the product.

---

## 8. Open decisions
1. **Facebook:** use only URL import plus ICS, or also run the paid Apify scraper (accepting the ToS risk)?
2. **Auto-publish:** which sources are trusted enough to skip review?
3. **Language:** Polish only at launch, or Polish and English? Poznań has a large international student population.
4. **Domain and hosting:** check that `kulturalnakarczma.pl` is available.
