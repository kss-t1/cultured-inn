// Idempotent seed of known venues (coordinates verified via Nominatim/OSM on 2026-11-03).
// Usage: bun run db:seed            venues only
//        bun run db:seed --demo     also adds sample PUBLISHED events for local development
import { sql, TZ } from "../src/db.ts";

const VENUES = [
  {
    name: "GOSU – Planszówkowa Kawiarnia",
    address: "Rybaki 22, 61-884 Poznań",
    district: "Stare Miasto",
    lat: 52.4018568,
    lon: 16.930201,
    aliases: ["Gosu", "Gosu Pub", "GOSU"],
  },
  {
    name: "Kosteczka",
    address: "Strzelecka 13/1, 61-845 Poznań",
    district: "Stare Miasto",
    lat: 52.404417,
    lon: 16.9332561,
    aliases: ["Kosteczka pub", "Pub Kosteczka"],
  },
  // ParaDice: address not verified yet (not in OSM); add it in the admin panel.
];

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

/** Sample events relative to today, so every quick filter has something to show. */
async function seedDemo() {
  const [city] = await sql`SELECT id FROM cities WHERE slug = 'poznan'`;
  const venues = await sql`SELECT id, name FROM venues ORDER BY id`;
  const gosu = venues.find((v: { name: string }) => v.name.startsWith("GOSU"))?.id ?? null;
  const kost = venues.find((v: { name: string }) => v.name === "Kosteczka")?.id ?? null;
  const demo: [string, string, number, string, number | null, number, boolean, boolean][] = [
    // title, category, day offset, start time, venue, duration h, free, beginner
    ["[DEMO] Wieczór planszówkowy", "BOARDGAMES", 0, "18:00", gosu, 5, true, true],
    ["[DEMO] Impro jam", "IMPRO", 0, "19:30", kost, 2, false, true],
    ["[DEMO] One-shot D&D dla początkujących", "RPG", 1, "17:00", gosu, 4, false, true],
    ["[DEMO] Turniej Carcassonne", "BOARDGAMES", 3, "12:00", kost, 6, false, false],
    ["[DEMO] Larp kameralny „Ostatnia karczma”", "LARP", 5, "16:00", null, 6, false, false],
  ];
  for (const [title, category, day, time, venueId, hours, free, beginner] of demo) {
    const slug = `demo-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    await sql`
      INSERT INTO events (city_id, title, slug, description, category, start_at, end_at, venue_id,
                          is_free, price_min, beginner_friendly, status, origin)
      VALUES (${city.id}, ${title}, ${slug}, 'Demo event for local development.', ${category}::category,
              (((now() AT TIME ZONE ${TZ})::date + ${day}::int)::timestamp + ${time}::time) AT TIME ZONE ${TZ},
              (((now() AT TIME ZONE ${TZ})::date + ${day}::int)::timestamp + ${time}::time) AT TIME ZONE ${TZ} + make_interval(hours => ${hours}),
              ${venueId}, ${free}, ${free ? null : 20}, ${beginner}, 'PUBLISHED', 'MANUAL')
      ON CONFLICT (slug) DO UPDATE SET start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at`;
  }
  console.log(`demo events: ${demo.length}`);
}

if (import.meta.main) {
  await seedVenues();
  if (process.argv.includes("--demo")) await seedDemo();
  await sql.close();
}
