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
