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
import { localDateKey } from "../../shared/format.ts";
import { fetchEvents } from "../api.ts";

/** Calendar view: uses all filters except the date window, which comes from the visible range. */
export function EventCalendar({ filters, isDesktop }: { filters: Filters; isDesktop: boolean }) {
  const loadEvents = async (info: EventSourceFuncInfo) => {
    const lastDay = new Date(info.end.getTime() - 1); // `end` is exclusive
    const events = await fetchEvents({ ...filters, from: localDateKey(info.start), to: localDateKey(lastDay) });
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
        key={`${isDesktop}-${JSON.stringify({ ...filters, when: null, from: null, to: null })}`}
        plugins={[classicTheme, dayGridPlugin, timeGridPlugin, listPlugin]}
        locale={plLocale}
        initialView={isDesktop ? "dayGridMonth" : "listWeek"}
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
