import { useEffect, useState } from "react";
import { parseFilters, serializeFilters, type Filters } from "../shared/filters.ts";
import { t } from "../shared/i18n/index.ts";
import type { PublicEvent } from "../shared/types.ts";
import { fetchEvents } from "./api.ts";
import { EventCalendar } from "./components/EventCalendar.tsx";
import { EventList } from "./components/EventList.tsx";
import { EventMap } from "./components/EventMap.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { useDebounced, useMediaQuery } from "./hooks.ts";

type View = "list" | "map" | "calendar";
const VIEWS: View[] = ["map", "list", "calendar"];

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
  const isDesktop = useMediaQuery("(min-width: 960px)");
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
    if (view === "calendar") return; // EventCalendar fetches its own events
    const ctrl = new AbortController();
    setLoad((l) => (l.status === "ok" ? l : { status: "loading" }));
    fetchEvents(queryFilters, ctrl.signal)
      .then((events) => setLoad({ status: "ok", events }))
      .catch((e) => {
        if (e.name !== "AbortError") setLoad({ status: "error" });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view === "calendar"]);

  const events = load.status === "ok" ? load.events : [];
  const tabs: { id: View; label: string }[] = isDesktop
    ? [{ id: "list", label: t.views.listAndMap }, { id: "calendar", label: t.views.calendar }]
    : VIEWS.map((id) => ({ id, label: t.views[id] }));
  const activeTab = isDesktop && view === "map" ? "list" : view;

  const list = <EventList state={load} />;
  const map = <EventMap events={events} />;

  return (
    <div className="app">
      <header className="site-header">
        <a href="/" className="brand">
          <span className="brand-name">{t.brand.nameFirst} <b>{t.brand.nameSecond}</b></span>
          <span className="tagline">{t.brand.tagline}</span>
        </a>
        <a href="/submit" className="header-link">{t.submit.headerLink}</a>
      </header>

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="view-bar">
        <div className="tabs" role="tablist" aria-label={t.filters.label}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className="tab"
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {load.status === "ok" && view !== "calendar" && (
          <span className="count" aria-live="polite">{t.list.count(events.length)}</span>
        )}
      </div>

      <main className={`content view-${activeTab}${isDesktop ? " desktop" : ""}`}>
        {activeTab === "calendar" ? (
          <EventCalendar filters={queryFilters} isDesktop={isDesktop} />
        ) : isDesktop ? (
          <div className="split">
            <section className="split-list">{list}</section>
            <section className="split-map">{map}</section>
          </div>
        ) : activeTab === "map" ? (
          map
        ) : (
          list
        )}
      </main>
    </div>
  );
}
