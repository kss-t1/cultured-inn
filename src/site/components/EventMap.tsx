import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { fmtShortDay, fmtTime } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import { iconSvg } from "../../shared/icons.ts";
import type { PublicEvent } from "../../shared/types.ts";
import { Icon } from "../../shared/ui.tsx";
import L, { POZNAN, TILE_URL } from "../leaflet.ts";

type Venue = NonNullable<PublicEvent["venue"]>;

/** Pin: a teardrop in the venue's category colour (split as a conic gradient when mixed). */
function pinIcon(cats: Category[], count: number): L.DivIcon {
  const slugs = CATEGORIES.filter((c) => cats.includes(c)).map((c) => CATEGORY_INFO[c].slug);
  const n = slugs.length;
  const bg = n === 1
    ? `var(--pin-${slugs[0]})`
    : `conic-gradient(${slugs.map((s, i) => `var(--pin-${s}) ${(i * 360) / n}deg ${((i + 1) * 360) / n}deg`).join(",")})`;
  const inner = count > 1 ? `<span class="pin__count">${count}</span>` : iconSvg(CATEGORY_INFO[cats[0]!].icon);
  return L.divIcon({
    html: `<span class="pin__head" style="background:${bg}">${inner}</span>`,
    className: "pin",
    iconSize: [44, 52],
    iconAnchor: [22, 46],
    popupAnchor: [0, -44],
  });
}

/** Popup DOM built with textContent, so event/venue text is never parsed as HTML. */
function popupContent(venue: Venue, events: PublicEvent[]): HTMLElement {
  const el = (tag: string, cls: string, parent: HTMLElement, text?: string) => {
    const node = parent.appendChild(document.createElement(tag));
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = document.createElement("div");
  const head = el("div", "popup__head", root);
  el("p", "popup__title", head, venue.name);
  el("p", "popup__addr", head, [venue.address, t.list.count(events.length)].filter(Boolean).join(" · "));
  const ul = el("ul", "popup__list", root);
  for (const e of events) {
    const cat = CATEGORY_INFO[e.category];
    const a = el("a", `popup__item cat-${cat.slug}`, el("li", "", ul)) as HTMLAnchorElement;
    a.href = `/events/${encodeURIComponent(e.slug)}`;
    el("span", "popup__ico", a).innerHTML = iconSvg(cat.icon);
    const text = el("span", "", a);
    el("span", "popup__when", text, `${fmtShortDay(e.start_at)} · ${fmtTime(e.start_at)}`);
    el("span", "popup__t", text, e.title);
  }
  return root;
}

/** `onShowList` adds a "Pokaż" link to the "no location" note (phones, where the list is another tab). */
export function EventMap({ events, onShowList }: { events: PublicEvent[]; onShowList?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const [locError, setLocError] = useState(false);

  useEffect(() => {
    const m = L.map(el.current!, { center: POZNAN, zoom: 13, scrollWheelZoom: true, zoomControl: false });
    L.control.zoom({
      zoomInText: iconSvg("plus"), zoomInTitle: t.map.zoomIn,
      zoomOutText: iconSvg("minus"), zoomOutTitle: t.map.zoomOut,
    }).addTo(m);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: t.map.attribution }).addTo(m);
    const c = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
    m.addLayer(c);
    m.on("locationfound", (e) => {
      setLocError(false);
      L.circleMarker(e.latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#1f56c9", fillOpacity: 1 }).addTo(m);
    });
    m.on("locationerror", () => setLocError(true));
    map.current = m;
    cluster.current = c;
    // The container can resize (tab switch, split layout); keep Leaflet's size in sync.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  const located = events.filter((e) => e.venue?.lat != null && e.venue?.lon != null);
  const unlocated = events.length - located.length;

  useEffect(() => {
    const c = cluster.current!;
    c.clearLayers();
    const byVenue = new Map<number, { venue: Venue; events: PublicEvent[] }>();
    for (const e of located) {
      const v = e.venue!;
      const g = byVenue.get(v.id) ?? { venue: v, events: [] };
      g.events.push(e);
      byVenue.set(v.id, g);
    }
    const markers = [...byVenue.values()].map(({ venue, events: evs }) => {
      const cats = [...new Set(evs.map((e) => e.category))];
      return L.marker([venue.lat!, venue.lon!], {
        icon: pinIcon(cats, evs.length),
        title: `${venue.name}: ${t.list.count(evs.length)}`,
        keyboard: true,
      }).bindPopup(() => popupContent(venue, evs), { maxWidth: 300, minWidth: 240 });
    });
    c.addLayers(markers);
    if (markers.length) {
      map.current!.fitBounds(c.getBounds(), { padding: [40, 40], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <div className="map" role="region" aria-label={t.map.label}>
      <div ref={el} className="map__canvas" />
      <button type="button" className="btn btn--secondary map__near"
        onClick={() => map.current?.locate({ setView: true, maxZoom: 15 })}>
        <Icon name="locate" />{t.map.nearMe}
      </button>
      {(locError || unlocated > 0) && (
        <div className="map__notes">
          {locError && <div className="map__note" role="alert"><Icon name="info" /><span>{t.map.locationError}</span></div>}
          {unlocated > 0 && (
            <div className="map__note">
              <Icon name="info" /><span>{t.map.noLocation(unlocated)}</span>
              {onShowList && <button type="button" className="linkbtn" onClick={onShowList}>{t.map.show}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
