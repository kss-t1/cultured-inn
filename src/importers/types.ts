// Shared importer types. Adapters fetch and parse; pipeline.ts decides what to keep and how to store it.
import { z } from "zod";
import { CATEGORIES, type Category } from "../shared/categories.ts";

/** One event as an adapter saw it, before classification and venue matching. */
export interface EventCandidate {
  /** Stable id within the source (ICS UID + occurrence, Facebook event id, ...). */
  externalId: string;
  title: string;
  description: string;
  start: Date;
  end: Date | null;
  allDay?: boolean;
  /** Free-text location as the source wrote it ("Rojber Pub, ul. Nowowiejskiego 8/5"). */
  locationName?: string | null;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  url?: string | null;
  ticketUrl?: string | null;
  imageUrl?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  isFree?: boolean;
  organizerName?: string | null;
  cancelled?: boolean;
  /** Recurring series this occurrence belongs to (ICS UID), if any. */
  seriesKey?: string | null;
  seriesRule?: string | null;
  /** Extra text used only for classification (e.g. source categories). */
  classifyHint?: string;
  raw: unknown;
}

export interface AdapterResult {
  candidates: EventCandidate[];
  /**
   * True when the adapter returned everything the source currently lists up to `horizon`,
   * so items that are not returned can be flagged as missing.
   */
  complete: boolean;
  horizon?: Date;
  /** Non-fatal problems worth showing on the Sources page. */
  warnings?: string[];
}

const Rule = z.object({
  /** Case-insensitive regex tested against title (+ description when matchOn includes it). */
  match: z.string(),
  category: z.enum(CATEGORIES).optional(),
  tags: z.array(z.string()).optional(),
  /** Drop matching items. */
  skip: z.boolean().optional(),
});

/** sources.config, validated. Unknown keys are kept so adapters can add their own. */
export const SourceConfig = z.looseObject({
  /** Per-source rules, first match wins (DESIGN.md §5 step 3). */
  rules: z.array(Rule).optional(),
  /** Drop items that match no rule and no category keyword (broad sources). */
  requireMatch: z.boolean().optional(),
  /** Regex; matching items are dropped before classification. */
  exclude: z.string().optional(),
  /** Which fields keyword classification reads. Default: both. */
  matchOn: z.array(z.enum(["title", "description"])).optional(),
  /** Tags added to every event from this source. */
  tags: z.array(z.string()).optional(),
  /** ICS: how far ahead to expand recurring events. */
  horizonDays: z.number().int().positive().max(365).optional(),
  /** JSONLD: pages to read (sources.url is used when absent). */
  urls: z.array(z.string().url()).optional(),
  /** FB_PAGE: "direct" (free, logged-out fetch), "apify" (needs APIFY_TOKEN), or "auto". */
  provider: z.enum(["direct", "apify", "auto"]).optional(),
  /** poznan_pl: number of days ahead to read. */
  days: z.number().int().positive().max(120).optional(),
});
export type SourceConfig = z.infer<typeof SourceConfig>;

export const SOURCE_KINDS = ["ICS", "JSONLD", "HTML_ADAPTER", "FB_PAGE", "MANUAL_URL", "LLM_PAGE"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceRow {
  id: number;
  key: string | null;
  name: string;
  kind: SourceKind;
  url: string | null;
  adapter_name: string | null;
  config: SourceConfig;
  default_category: Category | null;
  default_venue_id: number | null;
  default_organizer_id: number | null;
  trust: "AUTO_PUBLISH" | "REVIEW";
  enabled: boolean;
}

export type Adapter = (source: SourceRow) => Promise<AdapterResult>;
