import type { CSSProperties } from "react";
import { CATEGORY_INFO } from "../../shared/categories.ts";
import { fmtDay, fmtPrice, fmtRange, localDateKey } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import type { PublicEvent } from "../../shared/types.ts";

type State = { status: "loading" } | { status: "error" } | { status: "ok"; events: PublicEvent[] };

function groupByDay(events: PublicEvent[]) {
  const groups = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const key = localDateKey(e.start_at);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()];
}

export function EventCard({ e }: { e: PublicEvent }) {
  const cat = CATEGORY_INFO[e.category];
  const price = fmtPrice(e);
  return (
    <li className="card" style={{ "--cat": cat.color } as CSSProperties}>
      <div className="card-time">
        <time dateTime={e.start_at}>{fmtRange(e.start_at, e.end_at)}</time>
      </div>
      <div className="card-body">
        <a className="card-title" href={`/events/${e.slug}`}>{e.title}</a>
        <div className="card-meta">
          <span className="cat-label"><span aria-hidden="true">{cat.icon}</span> {t.categories[e.category]}</span>
          <span>{e.venue?.name ?? t.list.venueTbd}</span>
          {price && <span>{price}</span>}
        </div>
        {(e.beginner_friendly || e.language !== "pl" || e.is_recurring) && (
          <div className="card-badges">
            {e.beginner_friendly && <span className="badge good">{t.event.beginner}</span>}
            {e.language !== "pl" && <span className="badge">{t.event.english}</span>}
            {e.is_recurring && <span className="badge">{t.event.recurring}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

export function EventList({ state }: { state: State }) {
  if (state.status === "loading") return <p className="status">{t.list.loading}</p>;
  if (state.status === "error") return <p className="status error" role="alert">{t.list.loadError}</p>;
  if (state.events.length === 0) {
    return (
      <div className="status empty">
        <p>{t.list.empty}</p>
        <p className="muted">{t.list.emptyHint}</p>
      </div>
    );
  }
  return (
    <div className="event-list">
      {groupByDay(state.events).map((day) => (
        <section key={day[0]!.start_at} className="day">
          <h2 className="day-heading">{fmtDay(day[0]!.start_at)}</h2>
          <ul className="cards">
            {day.map((e) => <EventCard key={e.id} e={e} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
