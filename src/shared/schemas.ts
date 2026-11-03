// zod schemas for admin input. JSON field names are snake_case, matching the DB columns.
// Custom messages are error codes, translated by the UI (t.fieldErrors).
import { z } from "zod";
import { CATEGORIES } from "./categories.ts";

export const STATUSES = ["DRAFT", "PUBLISHED", "HIDDEN", "CANCELLED"] as const;
export type EventStatus = (typeof STATUSES)[number];
export const LANGUAGES = ["pl", "en", "both"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Europe/Warsaw wall-clock time as produced by <input type="datetime-local">. */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "invalid_datetime");

const optText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const optUrl = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.url({ protocol: /^https?$/, error: "invalid_url" }).nullable());

const optId = z.number().int().positive().nullish().transform((v) => v ?? null);
const optPrice = z.number().nonnegative().max(100000).nullish().transform((v) => v ?? null);

export const EventInput = z
  .object({
    title: z.string().trim().min(1, "required").max(200),
    description: z.string().max(20000).default(""),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
    start_local: localDateTime,
    end_local: localDateTime.nullish().transform((v) => v ?? null),
    venue_id: optId,
    organizer_id: optId,
    price_min: optPrice,
    price_max: optPrice,
    currency: z.string().length(3).toUpperCase().default("PLN"),
    is_free: z.boolean().default(false),
    language: z.enum(LANGUAGES).default("pl"),
    beginner_friendly: z.boolean().default(false),
    ticket_url: optUrl,
    source_url: optUrl,
    image_url: optUrl,
    status: z.enum(STATUSES).default("DRAFT"),
  })
  .refine((e) => !e.end_local || e.end_local >= e.start_local, {
    message: "end_before_start",
    path: ["end_local"],
  })
  .refine((e) => e.price_min === null || e.price_max === null || e.price_max >= e.price_min, {
    message: "price_max_below_min",
    path: ["price_max"],
  });
export type EventInput = z.infer<typeof EventInput>;

export const StatusInput = z.object({ status: z.enum(STATUSES) });

export const VenueInput = z
  .object({
    name: z.string().trim().min(1, "required").max(200),
    address: optText(300),
    district: optText(100),
    lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
    lon: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
    website: optUrl,
    facebook_url: optUrl,
    is_approximate_location: z.boolean().default(false),
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  })
  .refine((v) => (v.lat === null) === (v.lon === null), {
    message: "coordinates_pair",
    path: ["lat"],
  });
export type VenueInput = z.infer<typeof VenueInput>;

export const OrganizerInput = z.object({
  name: z.string().trim().min(1, "required").max(200),
  website: optUrl,
  facebook_url: optUrl,
  instagram: optText(200),
  contact_email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.email("invalid_email").nullable()),
  notes: optText(5000),
});
export type OrganizerInput = z.infer<typeof OrganizerInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(1).max(500),
});

export const SOURCE_KINDS_EDITABLE = ["ICS", "JSONLD", "HTML_ADAPTER", "FB_PAGE"] as const;
export const TRUST_LEVELS = ["AUTO_PUBLISH", "REVIEW"] as const;

/** Import source form. `config` is validated against SourceConfig on the server. */
export const SourceInput = z
  .object({
    name: z.string().trim().min(1, "required").max(200),
    key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/, "invalid").max(60).nullish().transform((v) => v || null),
    kind: z.enum(SOURCE_KINDS_EDITABLE),
    url: optUrl,
    adapter_name: optText(60),
    config: z.record(z.string(), z.unknown()).default({}),
    default_category: z.enum(CATEGORIES).nullish().transform((v) => v ?? null),
    default_venue_id: optId,
    default_organizer_id: optId,
    trust: z.enum(TRUST_LEVELS).default("AUTO_PUBLISH"),
    enabled: z.boolean().default(true),
    schedule_hours: z.number().int().min(1).max(24 * 7).default(24),
  })
  .refine((s) => s.kind !== "HTML_ADAPTER" || s.adapter_name, { message: "required", path: ["adapter_name"] })
  .refine((s) => s.kind === "HTML_ADAPTER" || s.kind === "JSONLD" || s.url, { message: "required", path: ["url"] });
export type SourceInput = z.infer<typeof SourceInput>;

export const ImportUrlInput = z.object({ url: z.string().trim().min(1, "required").max(2000) });
export const BulkInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(["publish", "hide", "dismiss_flags"]),
});
export const MergeInput = z.object({ into: z.number().int().positive() });
