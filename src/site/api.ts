import { serializeFilters, type Filters } from "../shared/filters.ts";
import type { PublicEvent } from "../shared/types.ts";

export async function fetchEvents(filters: Filters, signal?: AbortSignal): Promise<PublicEvent[]> {
  const res = await fetch(`/api/events?${serializeFilters(filters)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { events: PublicEvent[] }).events;
}
