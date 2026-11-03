import { CATEGORY_INFO } from "../../shared/categories.ts";
import { addDays, eventDays, fmtDay, fmtPrice, fmtRange, fmtTime, isMultiday, localDateKey } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import type { IconName } from "../../shared/icons.ts";
import type { PublicEvent } from "../../shared/types.ts";
import { Icon } from "../../shared/ui.tsx";

function groupByDay(events: PublicEvent[]) {
  const groups = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const key = localDateKey(e.start_at);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.entries()];
}

/** Number of local dates an event covers (2 for Fri evening–Sat). */
function dayCount(e: PublicEvent): number {
  const [first, last] = eventDays(e);
  return Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
}

function Badge({ icon, label, en }: { icon: IconName; label: string; en?: boolean }) {
  return <span className={en ? "badge badge--en" : "badge"}><Icon name={icon} />{label}</span>;
}

/** A "ticket": stub with the time and category icon, body with the details. */
export function EventCard({ e }: { e: PublicEvent }) {
  const cat = CATEGORY_INFO[e.category];
  const multi = isMultiday(e);
  const sameDayEnd = e.end_at && localDateKey(e.end_at) === localDateKey(e.start_at);
  return (
    <a className={`card cat-${cat.slug}${multi ? " card--multi" : ""}`} href={`/events/${e.slug}`}>
      <span className="card__stub">
        <span className="card__time">{multi ? dayCount(e) : fmtTime(e.start_at)}</span>
        {multi ? <span className="card__end">{t.list.days}</span>
          : sameDayEnd ? <span className="card__end">–{fmtTime(e.end_at!)}</span> : null}
        <Icon name={cat.icon} />
      </span>
      <span className="card__body">
        <span className="card__cat">{t.categories[e.category]}</span>
        <span className="card__title">{e.title}</span>
        {(multi || (e.end_at && !sameDayEnd)) && <span className="card__when">{fmtRange(e.start_at, e.end_at)}</span>}
        {e.venue
          ? <span className="card__venue"><Icon name="pin" size="sm" />{e.venue.name}</span>
          : <span className="card__venue is-unknown"><Icon name="pinq" size="sm" />{t.list.venueTbd}</span>}
        <span className="card__meta">
          {e.is_free
            ? <span className="badge badge--free"><Icon name="coin" />{t.event.freeBadge}</span>
            : fmtPrice(e) && <span className="price">{fmtPrice(e)}</span>}
          {e.is_recurring && <Badge icon="repeat" label={t.event.recurring} />}
          {e.beginner_friendly && <Badge icon="sprout" label={t.event.beginner} />}
          {e.language !== "pl" && <Badge icon="globe" label={t.event.english} en />}
          {multi && <Badge icon="cal" label={t.event.multiday} />}
        </span>
      </span>
    </a>
  );
}

export function EventList({ events }: { events: PublicEvent[] }) {
  const today = localDateKey(new Date());
  const tomorrow = addDays(today, 1);
  return (
    <div>
      {groupByDay(events).map(([key, day]) => (
        <section key={key} className="day" aria-label={fmtDay(day[0]!.start_at)}>
          <div className="day__head">
            <h2 className="day__name">{fmtDay(day[0]!.start_at)}</h2>
            {key === today && <span className="day__rel">{t.when.today}</span>}
            {key === tomorrow && <span className="day__rel">{t.when.tomorrow}</span>}
            <span className="day__rule" />
          </div>
          {day.map((e) => <EventCard key={e.id} e={e} />)}
        </section>
      ))}
    </div>
  );
}

const SKELETON_WIDTHS = ["86%", "64%", "78%", "58%"];

export function ListLoading() {
  return (
    <div role="status" aria-busy="true">
      <p className="loading-line"><Icon name="rpg" size="lg" />{t.list.loading}</p>
      <div style={{ display: "grid", gap: 12 }}>
        {SKELETON_WIDTHS.map((w) => (
          <div key={w} className="sk-card">
            <span className="sk-card__stub" />
            <span className="sk-card__body">
              <span className="sk" style={{ width: "30%", height: 12 }} />
              <span className="sk" style={{ width: w, height: 18 }} />
              <span className="sk" style={{ width: "48%", height: 14 }} />
              <span className="sk" style={{ width: "38%", height: 22 }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListError() {
  return (
    <div className="notice notice--danger" role="alert">
      <Icon name="info" />
      <p className="notice__t">{t.list.loadError}</p>
    </div>
  );
}

export function NoEvents({ onClear, onWholeMonth }: { onClear: () => void; onWholeMonth: () => void }) {
  return (
    <div className="empty" role="status">
      <svg className="empty__art" viewBox="0 0 200 132" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx="53" cy="56" r="24" style={{ fill: "var(--gold)", opacity: 0.16, stroke: "none" }} />
        <path d="M53 40c5 6 7 10 7 14a7 7 0 0 1-14 0c0-3 2-6 4-8 .5 2 1.5 3 2.5 3.5 0-3.5 0-6 .5-9.5z" style={{ fill: "var(--gold)", stroke: "none" }} />
        <path d="M53 64v6" />
        <rect x="44" y="70" width="18" height="42" rx="3" />
        <path d="M44 80c3 0 3 6 6 6" />
        <g transform="rotate(-12 112 92)"><rect x="96" y="76" width="32" height="32" rx="7" /><circle cx="112" cy="92" r="3" fill="currentColor" /></g>
        <path d="M104 40a7 7 0 1 1 9 6.7c-1.5.5-2.5 1.6-2.5 3.3v1M110.5 58v.5" />
        <path d="M146 80h24v28a4 4 0 0 1-4 4h-16a4 4 0 0 1-4-4z" />
        <path d="M170 86h5a6 6 0 0 1 0 12h-5M152 88v16M158 88v16M164 88v16" />
        <path d="M12 112h176M30 112v14M170 112v14" />
      </svg>
      <h2 className="empty__title">{t.list.empty}</h2>
      <p className="empty__hint">{t.list.emptyHint}</p>
      <div className="empty__actions">
        <button type="button" className="btn btn--primary" onClick={onClear}>{t.filters.clear}</button>
        <button type="button" className="btn btn--secondary" onClick={onWholeMonth}><Icon name="cal" />{t.list.showMonth}</button>
      </div>
    </div>
  );
}
