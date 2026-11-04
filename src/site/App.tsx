import { useEffect, useState } from "react";
import { DEFAULT_FILTERS, parseFilters, serializeFilters, type Filters } from "../shared/filters.ts";
import { fmtDays, monthEnd, windowDays } from "../shared/format.ts";
import { t } from "../shared/i18n/index.ts";
import type { IconName } from "../shared/icons.ts";
import type { PublicEvent } from "../shared/types.ts";
import { Icon, SiteFooter, SiteHeader } from "../shared/ui.tsx";
import { fetchEvents } from "./api.ts";
import { EventCalendar } from "./components/EventCalendar.tsx";
import { EventList, ListError, ListLoading, NoEvents } from "./components/EventList.tsx";
import { EventMap } from "./components/EventMap.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { useDebounced, useMediaQuery } from "./hooks.ts";

type View = "list" | "map" | "calendar";
const VIEWS: View[] = ["list", "map", "calendar"];
const VIEW_ICONS: Record<View, IconName> = { list: "list", map: "map", calendar: "cal" };

/** Floating "back to top" button, shown once the page is scrolled more than a screen down. */
function ToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <button type="button" className="btn btn--secondary btn--icon totop" aria-label={t.list.toTop}
      onClick={() => window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" })}>
      <Icon name="chev" />
    </button>
  );
}

function readUrl(): { filters: Filters; view: View } {
  const params = new URLSearchParams(location.search);
  const v = params.get("view");
  return { filters: parseFilters(params), view: VIEWS.includes(v as View) ? (v as View) : "list" };
}

function writeUrl(filters: Filters, view: View) {
  const params = serializeFilters(filters);
  if (view !== "list") params.set("view", view);
  const qs = params.toString();
  const url = qs ? `?${qs}` : location.pathname;
  if (url !== location.search) history.replaceState(null, "", url);
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ok"; events: PublicEvent[] };

export function App() {
  const [{ filters, view }, setState] = useState(readUrl);
  const isDesktop = useMediaQuery("(min-width: 1000px)");
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const setFilters = (f: Filters) => setState((s) => ({ ...s, filters: f }));
  const setView = (v: View) => setState((s) => ({ ...s, view: v }));

  useEffect(() => writeUrl(filters, view), [filters, view]);
  useEffect(() => {
    const onPop = () => setState(readUrl());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // Debounce only the free-text query; chip clicks apply immediately.
  const q = useDebounced(filters.q, 300);
  const queryFilters = { ...filters, q };
  const key = serializeFilters(queryFilters).toString();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoad((l) => (l.status === "ok" ? l : { status: "loading" }));
    fetchEvents(queryFilters, ctrl.signal)
      .then((events) => setLoad({ status: "ok", events }))
      .catch((e) => {
        if (e.name !== "AbortError") setLoad({ status: "error" });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const events = load.status === "ok" ? load.events : [];
  const days = windowDays(queryFilters);
  const tabs: { id: View; label: string; icon: IconName }[] = isDesktop
    ? [{ id: "list", label: t.views.listAndMap, icon: "map" }, { id: "calendar", label: t.views.calendar, icon: "cal" }]
    : VIEWS.map((id) => ({ id, label: t.views[id], icon: VIEW_ICONS[id] }));
  const activeTab = isDesktop && view === "map" ? "list" : view;

  const clear = () => setFilters(DEFAULT_FILTERS);
  const wholeMonth = () => setFilters({ ...filters, when: "month", from: null, to: null });
  const showMonth = (first: string) => setFilters({ ...filters, from: first, to: monthEnd(first) });
  const showDay = (day: string) => setState({ filters: { ...filters, from: day, to: null }, view: "list" });

  const notReady = load.status === "loading" ? <ListLoading /> : load.status === "error" ? <ListError /> : null;
  const isDefault = serializeFilters(queryFilters).toString() === "";
  const isMonth = !filters.from && filters.when === "month";
  // The calendar shows an empty month itself, keeping its month navigation.
  const results = notReady ?? (events.length === 0 && (
    <NoEvents onClear={isDefault ? undefined : clear} onWholeMonth={isMonth ? undefined : wholeMonth} />
  ));
  const map = <EventMap events={events} onShowList={isDesktop ? undefined : () => setView("list")} />;

  return (
    <>
      <SiteHeader />

      <main className="wrap">
        <FilterBar filters={filters} onChange={setFilters} collapsible={!isDesktop} />

        <div className="toolbar">
          <div className={isDesktop ? "tabs tabs--d" : "tabs tabs--m"} role="tablist" aria-label={t.views.label}>
            {tabs.map((tab) => (
              <button key={tab.id} type="button" role="tab" className="tab" aria-selected={activeTab === tab.id}
                onClick={() => setView(tab.id)}>
                <Icon name={tab.icon} />{tab.label}
              </button>
            ))}
          </div>
          <p className="count" aria-live="polite">
            <span className="count__n">{load.status === "ok" ? t.list.count(events.length) : t.list.counting}</span>
            <span className="count__range">{fmtDays(days)}</span>
          </p>
        </div>

        <div className="views">
          {activeTab === "calendar" ? (
            notReady ?? <EventCalendar events={events} days={days} onMonth={showMonth} onThisMonth={wholeMonth} onShowDay={showDay} />
          ) : isDesktop ? (
            <div className="split">
              <section className="split__list">{results || <EventList events={events} />}</section>
              <section className="split__map">{map}</section>
            </div>
          ) : activeTab === "map" ? (
            map
          ) : (
            results || <EventList events={events} />
          )}
        </div>
      </main>

      <SiteFooter note={t.brand.sources} />
      <ToTop />
    </>
  );
}
