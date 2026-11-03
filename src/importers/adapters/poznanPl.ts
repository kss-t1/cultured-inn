// City culture calendar (poznan.pl / kultura.poznan.pl). Undocumented but public JSON:
//   /mim/public/events-json/events.json?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&p=N
// 15 events per page and ~650 per month; robots.txt asks for Crawl-delay: 10, so a 30-day
// read takes ~7 minutes. Almost everything is unrelated (concerts, exhibitions), so the source
// relies on keyword classification with requireMatch.
import { slugify } from "../../shared/slug.ts";
import type { Adapter, EventCandidate } from "../types.ts";
import { excerpt, htmlToText, localToUtc, parsePrice, politeFetch } from "../util.ts";

const BASE = "https://www.poznan.pl/mim/public/events-json/events.json";
const CRAWL_DELAY_MS = 10_000;
const MAX_PAGES = 120;

export interface PoznanPlEvent {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  date_from: string;
  hour_from?: string;
  date_to?: string;
  hour_to?: string;
  miejsce?: string;
  pictures?: { url?: string }[];
  tickets?: unknown[];
}

export function poznanPlToCandidate(e: PoznanPlEvent): EventCandidate | null {
  const start = localToUtc(e.date_from, e.hour_from || null);
  if (!start || !e.title) return null;
  // date_to without hour_to: ends that day (festival); hour_to alone: same day.
  const endDate = e.date_to || (e.hour_to ? e.date_from : "");
  let end = endDate ? localToUtc(endDate, e.hour_to || "23:59") : null;
  if (end && end <= start) end = null;
  const description = htmlToText(e.description ?? "");
  const summary = htmlToText(e.summary ?? "");
  const price = parsePrice(`${summary}\n${description}`);
  return {
    // The same id is listed once per date for repeated shows.
    externalId: `${e.id}@${e.date_from}`,
    title: htmlToText(e.title),
    description: excerpt([summary, description].filter(Boolean).join("\n\n")),
    start,
    end,
    allDay: !e.hour_from,
    locationName: e.miejsce ? htmlToText(e.miejsce) : null,
    url: `https://kultura.poznan.pl/mim/kultura/events/${e.date_from}/${slugify(e.title)},${e.id}.html`,
    imageUrl: e.pictures?.[0]?.url ?? null,
    ...price,
    raw: e,
  };
}

export const poznanPlAdapter: Adapter = async (source) => {
  const days = source.config.days ?? 30;
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }); // YYYY-MM-DD
  const horizon = new Date(today.getTime() + days * 86_400_000);
  const candidates: EventCandidate[] = [];
  let pages = 1;
  for (let p = 1; p <= pages && p <= MAX_PAGES; p++) {
    const url = `${BASE}?date_from=${fmt(today)}&date_to=${fmt(horizon)}&p=${p}`;
    const data = (await (await politeFetch(url, { minIntervalMs: CRAWL_DELAY_MS, timeoutMs: 60_000 })).json()) as {
      events?: PoznanPlEvent[];
      metadata?: { allPages?: string };
    };
    pages = Number(data.metadata?.allPages ?? 1);
    for (const e of data.events ?? []) {
      const c = poznanPlToCandidate(e);
      if (c) candidates.push(c);
    }
  }
  return { candidates, complete: pages <= MAX_PAGES, horizon };
};
