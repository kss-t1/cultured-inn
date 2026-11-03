import { useState } from "react";
import { CATEGORY_INFO } from "../../shared/categories.ts";
import {
  addDays, eventDays, fmtMonth, fmtTime, fmtWeekdayShort, isMultiday, localDateKey, monthEnd, weekdayIndex,
} from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import type { PublicEvent } from "../../shared/types.ts";
import { Icon } from "../../shared/ui.tsx";

const MAX_PER_CELL = 3;
const MAX_SPAN_DAYS = 62;

const monthStart = (day: string) => day.slice(0, 8) + "01";
const shiftMonth = (first: string, n: number) => {
  const d = new Date(first + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
};

function eventsByDay(events: PublicEvent[]): Map<string, PublicEvent[]> {
  const map = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const [first, last] = eventDays(e);
    for (let d = first, i = 0; d <= last && i < MAX_SPAN_DAYS; d = addDays(d, 1), i++) {
      const list = map.get(d);
      if (list) list.push(e);
      else map.set(d, [e]);
    }
  }
  return map;
}

function CalEvent({ e, day }: { e: PublicEvent; day: string }) {
  const cat = CATEGORY_INFO[e.category];
  const multi = isMultiday(e);
  const isFirst = localDateKey(e.start_at) === day;
  return (
    <a className={`cal-ev cat-${cat.slug}${multi ? " cal-ev--span" : ""}`} href={`/events/${e.slug}`} title={e.title}>
      <Icon name={cat.icon} />
      {isFirst && <b>{fmtTime(e.start_at)}</b>}
      <span>{isFirst ? e.title : `${t.calendar.continued} ${e.title}`}</span>
    </a>
  );
}

/**
 * Month grid (desktop) and list of days (phones, via CSS) of the events already loaded for the
 * selected window. Opens on the window's first month; "+N więcej" opens that day in the list.
 */
export function EventCalendar({ events, days, onShowDay }: {
  events: PublicEvent[];
  days: [string, string];
  onShowDay: (day: string) => void;
}) {
  const today = localDateKey(new Date());
  const [month, setMonth] = useState(() => monthStart(days[0]));
  const byDay = eventsByDay(events);
  const last = monthEnd(month);
  const gridStart = addDays(month, -weekdayIndex(month));
  const gridEnd = addDays(last, 6 - weekdayIndex(last));
  const cells: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
  const agenda = cells.filter((d) => d >= month && d <= last && byDay.has(d));

  return (
    <div className="cal">
      <div className="cal__head">
        <h2 className="cal__month">{fmtMonth(month)}</h2>
        <button type="button" className="btn btn--ghost btn--icon" aria-label={t.calendar.prev} onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="chevl" />
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setMonth(monthStart(today))}>{t.calendar.today}</button>
        <button type="button" className="btn btn--ghost btn--icon" aria-label={t.calendar.next} onClick={() => setMonth(shiftMonth(month, 1))}>
          <Icon name="chevr" />
        </button>
      </div>
      <div className="cal__dow" aria-hidden="true">
        {t.calendar.weekdays.map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="cal__grid">
        {cells.map((d) => {
          const evs = d >= month && d <= last ? byDay.get(d) ?? [] : [];
          const cls = ["cal__cell", (d < month || d > last) && "is-out", d === today && "is-today", weekdayIndex(d) >= 5 && "is-we"];
          return (
            <div key={d} className={cls.filter(Boolean).join(" ")}>
              <span className="cal__date">{Number(d.slice(8))}</span>
              {evs.slice(0, MAX_PER_CELL).map((e) => <CalEvent key={e.id} e={e} day={d} />)}
              {evs.length > MAX_PER_CELL && (
                <a className="cal__more" href={`/?from=${d}`} onClick={(ev) => { ev.preventDefault(); onShowDay(d); }}>
                  {t.calendar.more(evs.length - MAX_PER_CELL)}
                </a>
              )}
            </div>
          );
        })}
      </div>
      <ol className="agenda">
        {agenda.length === 0 && <li><span /><p className="muted">{t.calendar.none}</p></li>}
        {agenda.map((d) => (
          <li key={d} className={d === today ? "is-today" : undefined}>
            <div className="agenda__date">
              <span className="agenda__num">{Number(d.slice(8))}</span>
              <span className="agenda__dow">{fmtWeekdayShort(d)}</span>
            </div>
            <div className="agenda__evs">
              {byDay.get(d)!.map((e) => <CalEvent key={e.id} e={e} day={d} />)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
