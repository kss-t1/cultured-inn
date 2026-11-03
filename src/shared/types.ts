import type { Category } from "./categories.ts";
import type { EventStatus, Language } from "./schemas.ts";

/** Event as returned by the public API (GET /api/events). */
export interface PublicEvent {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: Category;
  tags: string[];
  start_at: string;
  end_at: string | null;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  language: Language;
  beginner_friendly: boolean;
  ticket_url: string | null;
  status: EventStatus;
  is_recurring: boolean;
  venue: {
    id: number;
    name: string;
    address: string | null;
    district: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  organizer: { id: number; name: string } | null;
}

export interface EventDetail extends PublicEvent {
  description: string;
  source_url: string | null;
  image_url: string | null;
  updated_at: string;
  venue_website: string | null;
  organizer_website: string | null;
}
