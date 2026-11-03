import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import plLocale from "@fullcalendar/react/locales/pl";
import classicTheme from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import type { EventSourceFuncInfo } from "@fullcalendar/react";
import { CATEGORY_INFO } from "../../shared/categories.ts";
import type { Filters } from "../../shared/filters.ts";
import { fetchEvents } from "../api.ts";

/** Calendar view: shows the events of the selected window ("Ten miesiąc", Od–Do, …) like the list and map. */
export function EventCalendar({ filters, isDesktop }: { filters: Filters; isDesktop: boolean }) {
  // FullCalendar draws only what falls inside the visible range, so the window's events are enough.
  const loadEvents = async (_info: EventSourceFuncInfo) => {
    const events = await fetchEvents(filters);
    return events.map((e) => ({
      id: String(e.id),
      title: e.title,
      start: e.start_at,
      end: e.end_at ?? undefined,
      url: `/events/${e.slug}`,
      color: CATEGORY_INFO[e.category].color,
    }));
  };

  return (
    <div className="calendar">
      <FullCalendar
        key={`${isDesktop}-${JSON.stringify(filters)}`}
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, listPlugin]}
        locale={plLocale}
        initialView={isDesktop ? "dayGridMonth" : "listWeek"}
        initialDate={filters.from ?? undefined}
        headerToolbar={
          isDesktop
            ? { start: "prev,next today", center: "title", end: "dayGridMonth,timeGridWeek,listWeek" }
            : { start: "prev,next", center: "title", end: "today" }
        }
        events={loadEvents}
        height="auto"
        firstDay={1}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        dayMaxEvents={4}
      />
    </div>
  );
}
