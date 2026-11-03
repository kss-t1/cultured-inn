// Filter state <-> URLSearchParams. Shared by the public SPA (URL state) and the API.
// Parsing is lenient: unknown or malformed values are dropped, so old shared links never break.
import { CATEGORIES, CATEGORY_INFO, categoryFromSlug, type Category } from "./categories.ts";

export const WHENS = ["today", "tomorrow", "weekend", "week"] as const;
export type When = (typeof WHENS)[number];
export type TimeOfDay = "day" | "evening";

export interface Filters {
  /** Quick window; ignored when `from` is set. */
  when: When;
  /** Local dates YYYY-MM-DD (inclusive). */
  from: string | null;
  to: string | null;
  cats: Category[];
  tags: string[];
  free: boolean;
  beginner: boolean;
  /** Only events runnable in English (language en or both). */
  english: boolean;
  multiday: boolean;
  time: TimeOfDay | null;
  priceMax: number | null;
  /** minLon, minLat, maxLon, maxLat */
  bbox: [number, number, number, number] | null;
  q: string;
}

export const DEFAULT_FILTERS: Filters = {
  when: "today",
  from: null,
  to: null,
  cats: [],
  tags: [],
  free: false,
  beginner: false,
  english: false,
  multiday: false,
  time: null,
  priceMax: null,
  bbox: null,
  q: "",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const list = (v: string | null) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const flag = (v: string | null) => v === "1" || v === "true";

export function parseFilters(params: URLSearchParams): Filters {
  const f: Filters = { ...DEFAULT_FILTERS, cats: [], tags: [] };

  const when = params.get("when");
  if (when && (WHENS as readonly string[]).includes(when)) f.when = when as When;

  const from = params.get("from");
  if (from && isValidDate(from)) {
    f.from = from;
    const to = params.get("to");
    if (to && isValidDate(to) && to >= from) f.to = to;
  }

  for (const c of list(params.get("cat"))) {
    const cat = categoryFromSlug(c);
    if (cat && !f.cats.includes(cat)) f.cats.push(cat);
  }
  f.cats.sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));

  f.tags = [...new Set(list(params.get("tags")).map((t) => t.toLowerCase().slice(0, 40)))].slice(0, 10);
  f.free = flag(params.get("free"));
  f.beginner = flag(params.get("beginner"));
  f.english = params.get("lang") === "en";
  f.multiday = flag(params.get("multiday"));

  const time = params.get("time") ?? (flag(params.get("evening")) ? "evening" : null);
  if (time === "day" || time === "evening") f.time = time;

  const priceMax = Number(params.get("priceMax"));
  if (params.get("priceMax") && Number.isFinite(priceMax) && priceMax >= 0) f.priceMax = priceMax;

  const bbox = list(params.get("bbox")).map(Number);
  if (bbox.length === 4 && bbox.every(Number.isFinite)) {
    const [minLon, minLat, maxLon, maxLat] = bbox as [number, number, number, number];
    if (minLon < maxLon && minLat < maxLat) f.bbox = [minLon, minLat, maxLon, maxLat];
  }

  f.q = (params.get("q") ?? "").trim().slice(0, 100);
  return f;
}

/** Inverse of parseFilters; omits defaults to keep URLs short. */
export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from) {
    p.set("from", f.from);
    if (f.to && f.to !== f.from) p.set("to", f.to);
  } else if (f.when !== DEFAULT_FILTERS.when) {
    p.set("when", f.when);
  }
  if (f.cats.length) p.set("cat", f.cats.map((c) => CATEGORY_INFO[c].slug).join(","));
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.free) p.set("free", "1");
  if (f.beginner) p.set("beginner", "1");
  if (f.english) p.set("lang", "en");
  if (f.multiday) p.set("multiday", "1");
  if (f.time) p.set("time", f.time);
  if (f.priceMax !== null) p.set("priceMax", String(f.priceMax));
  if (f.bbox) p.set("bbox", f.bbox.map((n) => +n.toFixed(5)).join(","));
  if (f.q) p.set("q", f.q);
  return p;
}
