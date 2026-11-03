// Nominatim geocoding: max 1 request/second (their usage policy), results cached in memory.
export interface GeocodeHit {
  display_name: string;
  lat: number;
  lon: number;
  district: string | null;
}

const cache = new Map<string, GeocodeHit[]>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function userAgent() {
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost";
  return `KulturalnaKarczma/0.1 (+${base})`;
}

export function geocode(query: string): Promise<GeocodeHit[]> {
  const key = query.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await Bun.sleep(wait);
    lastCall = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: query, format: "jsonv2", addressdetails: "1", limit: "5", countrycodes: "pl",
      "accept-language": "pl",
    }).toString();
    const res = await fetch(url, { headers: { "User-Agent": userAgent() }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = (await res.json()) as any[];
    const hits = data.map((d) => ({
      display_name: d.display_name as string,
      lat: Number(d.lat),
      lon: Number(d.lon),
      district: d.address?.suburb ?? d.address?.city_district ?? d.address?.quarter ?? null,
    }));
    cache.set(key, hits);
    return hits;
  });
  queue = run.catch(() => {});
  return run;
}
