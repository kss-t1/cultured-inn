// Idempotent seed of known venues, organizers and import sources
// (venue coordinates verified via Nominatim/OSM on 2026-11-03).
// Usage: bun run db:seed
import { sql } from "../src/db.ts";

const VENUES = [
  {
    name: "Podziemie",
    address: "Rybaki 22, 61-884 Poznań",
    district: "Stare Miasto",
    lat: 52.4018568,
    lon: 16.930201,
    aliases: ["Podziemie Poznań", "Gosu", "Gosu Pub", "GOSU"],
  },
  {
    name: "Kosteczka",
    address: "Strzelecka 13/1, 61-845 Poznań",
    district: "Stare Miasto",
    lat: 52.404417,
    lon: 16.9332561,
    aliases: ["Kosteczka pub", "Pub Kosteczka"],
  },
  {
    name: "Klub Fantastyki Druga Era",
    address: "Juliusza Słowackiego 13, 60-823 Poznań",
    district: "Jeżyce",
    lat: 52.4100082,
    lon: 16.9098643,
    aliases: ["Druga Era", "Druga Era Klub Fantastyki", "Słowackiego 13"],
  },
  {
    name: "Rojber Pub",
    address: "Feliksa Nowowiejskiego 8/5, 61-731 Poznań",
    district: "Stare Miasto",
    lat: 52.4093943,
    lon: 16.9270015,
    aliases: ["Rojber", "pub Rojber"],
  },
  {
    name: "ODK Pod Lipami",
    address: "os. Pod Lipami 108A, Poznań",
    district: "Winogrady",
    lat: 52.4311613,
    lon: 16.9403773,
    aliases: ["Osiedlowy Dom Kultury Pod Lipami", "Pod Lipami"],
  },
  {
    name: "ODK Orbita",
    address: "os. Kosmonautów 118, 61-641 Poznań",
    district: "Winogrady",
    lat: 52.4368988,
    lon: 16.9457598,
    aliases: ["Osiedlowy Dom Kultury Orbita", "Orbita", "Kosmonautów 118"],
  },
  // ParaDice: address not verified yet (not in OSM); add it in the admin panel.
];

const ORGANIZERS = [
  { name: "Klub Fantastyki Druga Era", website: "https://drugaera.org", facebook_url: "https://www.facebook.com/DrugaEra" },
  { name: "Stowarzyszenie Larpunk", website: "https://www.larpunk.pl", facebook_url: "https://www.facebook.com/stowarzyszenielarpunk" },
  { name: "La Vida Impro", website: "https://lavidaimpro.pl", facebook_url: "https://www.facebook.com/LaVidaImpro" },
  { name: "Larpowy Ogród", website: null, facebook_url: "https://www.facebook.com/larpowyogrod" },
  { name: "Wargamer Poznań", website: "https://poznan.wargamer.pl", facebook_url: "https://www.facebook.com/wargamer.poznan" },
  { name: "Cooliozum", website: null, facebook_url: "https://www.facebook.com/cooliozum" },
  { name: "Podziemie", website: null, facebook_url: "https://www.facebook.com/podziemiepoznan" },
  // Poznań impro groups (list from the project owner, 2026-11-03).
  { name: "Drukała Poprawa Ratajczak", website: null, facebook_url: "https://www.facebook.com/DPRimpro" },
  { name: "Improsi", website: null, facebook_url: "https://www.facebook.com/profile.php?id=61582069984035" },
  { name: "Leniwe Raz", website: null, facebook_url: "https://www.facebook.com/leniwerazimpro" },
  { name: "Czwórka na Szynach", website: null, facebook_url: "https://www.facebook.com/profile.php?id=61574240152074" },
  { name: "Improłaki", website: null, facebook_url: "https://www.facebook.com/profile.php?id=61589955491168" },
  { name: "Rymparzyści – teatr improwizacji", website: null, facebook_url: "https://www.facebook.com/profile.php?id=61572191894828" },
];

type Rule = { match: string; category?: string; tags?: string[]; skip?: boolean };
interface SourceSeed {
  key: string;
  name: string;
  kind: "ICS" | "JSONLD" | "HTML_ADAPTER" | "FB_PAGE";
  url?: string;
  adapter?: string;
  config?: { rules?: Rule[]; requireMatch?: boolean; exclude?: string; matchOn?: string[]; urls?: string[]; days?: number; tags?: string[] };
  category?: string;
  venue?: string;
  organizer?: string;
  trust?: "AUTO_PUBLISH" | "REVIEW";
  hours: number;
}

// Rules and keywords match Polish source text (data, not code).
const SOURCES: SourceSeed[] = [
  {
    key: "druga-era-ics",
    name: "Druga Era – kalendarz Google",
    kind: "ICS",
    url: "https://calendar.google.com/calendar/ical/1gal45mgfkeftq886581rdvlgg%40group.calendar.google.com/public/basic.ics",
    config: {
      rules: [
        { match: "Drugi Front|gry bitewne", category: "BOARDGAMES", tags: ["gry bitewne"] },
        { match: "Drugi Smok", category: "BOARDGAMES", tags: ["gry azjatyckie"] },
        { match: "Druga Tura|planszow|karcian", category: "BOARDGAMES" },
        { match: "Drugi Run|larp", category: "LARP" },
        { match: "\\brpg\\b|sesj[aei] rpg|gry fabularne", category: "RPG" },
      ],
      requireMatch: true,
      matchOn: ["title"],
    },
    venue: "Klub Fantastyki Druga Era",
    organizer: "Klub Fantastyki Druga Era",
    hours: 6,
  },
  {
    key: "poznan-pl",
    name: "poznan.pl – kalendarz kulturalny",
    kind: "HTML_ADAPTER",
    adapter: "poznan_pl",
    config: { requireMatch: true, matchOn: ["title"], days: 30, exclude: "jazz|koncert|recital|orkiestr|muzyk[ai] improwiz|improwizacj[ae] (muzyczn|organow|fortepian)" },
    hours: 24,
  },
  {
    key: "meetup-playzone",
    name: "Meetup – PlayZone Poznań",
    kind: "ICS",
    url: "https://www.meetup.com/play-connect-pozna%C5%84/events/ical/",
    category: "BOARDGAMES",
    hours: 12,
  },
  {
    key: "biletyna-poznan",
    name: "Biletyna – Poznań (kabaret, spektakle, stand-up)",
    kind: "JSONLD",
    config: {
      urls: ["https://biletyna.pl/kabaret/Poznan", "https://biletyna.pl/spektakl/Poznan", "https://biletyna.pl/stand-up/Poznan"],
      requireMatch: true,
      matchOn: ["title"],
    },
    hours: 24,
  },
  { key: "fb-larpunk", name: "Facebook – Stowarzyszenie Larpunk", kind: "FB_PAGE", url: "https://www.facebook.com/stowarzyszenielarpunk", category: "LARP", organizer: "Stowarzyszenie Larpunk", hours: 24 },
  { key: "fb-lavida-impro", name: "Facebook – La Vida Impro", kind: "FB_PAGE", url: "https://www.facebook.com/LaVidaImpro", category: "IMPRO", organizer: "La Vida Impro", hours: 24 },
  // Larpowy Ogród, Wargamer and Cooliozum show a login wall and go through Apify (billed per event): every 3 days.
  { key: "fb-larpowy-ogrod", name: "Facebook – Larpowy Ogród", kind: "FB_PAGE", url: "https://www.facebook.com/larpowyogrod", category: "LARP", organizer: "Larpowy Ogród", hours: 72 },
  { key: "fb-wargamer", name: "Facebook – Wargamer Poznań", kind: "FB_PAGE", url: "https://www.facebook.com/wargamer.poznan", category: "BOARDGAMES", organizer: "Wargamer Poznań", config: { tags: ["gry bitewne"] }, hours: 72 },
  { key: "fb-cooliozum", name: "Facebook – Cooliozum", kind: "FB_PAGE", url: "https://www.facebook.com/cooliozum", category: "BOARDGAMES", organizer: "Cooliozum", hours: 72 },
  { key: "fb-podziemie", name: "Facebook – Podziemie", kind: "FB_PAGE", url: "https://www.facebook.com/podziemiepoznan", category: "BOARDGAMES", venue: "Podziemie", organizer: "Podziemie", hours: 24 },
  // Poznań impro groups. DPR and Improsi are readable logged out; the others need Apify (every 3 days).
  { key: "fb-dpr-impro", name: "Facebook – Drukała Poprawa Ratajczak", kind: "FB_PAGE", url: "https://www.facebook.com/DPRimpro", category: "IMPRO", organizer: "Drukała Poprawa Ratajczak", hours: 24 },
  { key: "fb-improsi", name: "Facebook – Improsi", kind: "FB_PAGE", url: "https://www.facebook.com/profile.php?id=61582069984035", category: "IMPRO", organizer: "Improsi", hours: 24 },
  { key: "fb-leniwe-raz", name: "Facebook – Leniwe Raz", kind: "FB_PAGE", url: "https://www.facebook.com/leniwerazimpro", category: "IMPRO", organizer: "Leniwe Raz", hours: 72 },
  { key: "fb-czworka-na-szynach", name: "Facebook – Czwórka na Szynach", kind: "FB_PAGE", url: "https://www.facebook.com/profile.php?id=61574240152074", category: "IMPRO", organizer: "Czwórka na Szynach", hours: 72 },
  { key: "fb-improlaki", name: "Facebook – Improłaki", kind: "FB_PAGE", url: "https://www.facebook.com/profile.php?id=61589955491168", category: "IMPRO", organizer: "Improłaki", hours: 72 },
  { key: "fb-rymparzysci", name: "Facebook – Rymparzyści – teatr improwizacji", kind: "FB_PAGE", url: "https://www.facebook.com/profile.php?id=61572191894828", category: "IMPRO", organizer: "Rymparzyści – teatr improwizacji", hours: 72 },
];

export async function seedOrganizers() {
  for (const o of ORGANIZERS) {
    const [existing] = await sql`SELECT id FROM organizers WHERE name = ${o.name}`;
    if (existing) continue;
    await sql`INSERT INTO organizers (name, website, facebook_url) VALUES (${o.name}, ${o.website}, ${o.facebook_url})`;
    console.log(`organizer: ${o.name}`);
  }
}

/** Inserts missing sources by key; existing ones are left alone (admins may have tuned them). */
export async function seedSources() {
  for (const s of SOURCES) {
    const [existing] = await sql`SELECT id FROM sources WHERE key = ${s.key}`;
    if (existing) continue;
    const [venue] = s.venue ? await sql`SELECT id FROM venues WHERE name = ${s.venue}` : [];
    const [organizer] = s.organizer ? await sql`SELECT id FROM organizers WHERE name = ${s.organizer}` : [];
    await sql`
      INSERT INTO sources (key, name, kind, url, adapter_name, config, default_category, default_venue_id,
                           default_organizer_id, trust, schedule)
      VALUES (${s.key}, ${s.name}, ${s.kind}::source_kind, ${s.url ?? null}, ${s.adapter ?? null},
              ${s.config ?? {}}::jsonb, ${s.category ?? null}::category, ${venue?.id ?? null},
              ${organizer?.id ?? null}, ${s.trust ?? "AUTO_PUBLISH"}::source_trust, make_interval(hours => ${s.hours}))`;
    console.log(`source: ${s.name}`);
  }
}

export async function seedVenues() {
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  for (const v of VENUES) {
    const [existing] = await sql`SELECT id FROM venues WHERE name = ${v.name}`;
    if (existing) continue;
    await sql`
      INSERT INTO venues (city_id, name, address, district, lat, lon, aliases)
      VALUES (${city.id}, ${v.name}, ${v.address}, ${v.district}, ${v.lat}, ${v.lon}, ${sql.array(v.aliases, "TEXT")})`;
    console.log(`venue: ${v.name}`);
  }
}

if (import.meta.main) {
  await seedVenues();
  await seedOrganizers();
  await seedSources();
  await sql.close();
}
