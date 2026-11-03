import { useEffect, useRef, useState } from "react";
import { CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { fmtShortDay, fmtTime } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import type { PublicEvent } from "../../shared/types.ts";
import L, { POZNAN, TILE_URL } from "../leaflet.ts";

type Venue = NonNullable<PublicEvent["venue"]>;

/** Pin: a circle colored by the venue's categories (split as a conic gradient when mixed). */
function pinIcon(cats: Category[], count: number): L.DivIcon {
  const colors = cats.map((c) => CATEGORY_INFO[c].color);
  const bg = colors.length === 1
    ? colors[0]
    : `conic-gradient(${colors.map((c, i) => `${c} ${(i * 360) / colors.length}deg ${((i + 1) * 360) / colors.length}deg`).join(",")})`;
  const html = `<span class="pin" style="background:${bg}">${count > 1 ? count : ""}</span>`;
  return L.divIcon({ html, className: "pin-wrap", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
}

/** Popup DOM built with textContent, so event/venue text is never parsed as HTML. */
function popupContent(venue: Venue, events: PublicEvent[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "popup";
  const h = root.appendChild(document.createElement("strong"));
  h.textContent = venue.name;
  if (venue.address) {
    const a = root.appendChild(document.createElement("div"));
    a.className = "muted";
    a.textContent = venue.address;
  }
  const ul = root.appendChild(document.createElement("ul"));
  for (const e of events) {
    const li = ul.appendChild(document.createElement("li"));
    li.style.setProperty("--cat", CATEGORY_INFO[e.category].color);
    const time = li.appendChild(document.createElement("span"));
    time.className = "popup-time";
    time.textContent = `${fmtShortDay(e.start_at)} ${fmtTime(e.start_at)}`;
    const link = li.appendChild(document.createElement("a"));
    link.href = `/events/${encodeURIComponent(e.slug)}`;
    link.textContent = e.title;
  }
  return root;
}

export function EventMap({ events }: { events: PublicEvent[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const [locError, setLocError] = useState(false);

  useEffect(() => {
    const m = L.map(el.current!, { center: POZNAN, zoom: 13, scrollWheelZoom: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: t.map.attribution }).addTo(m);
    const c = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 40 });
    m.addLayer(c);
    m.on("locationfound", (e) => {
      setLocError(false);
      L.circleMarker(e.latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#1a73e8", fillOpacity: 1 }).addTo(m);
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
        title: venue.name,
        keyboard: true,
      }).bindPopup(() => popupContent(venue, evs), { maxWidth: 280 });
    });
    c.addLayers(markers);
    if (markers.length) {
      map.current!.fitBounds(c.getBounds(), { padding: [30, 30], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      <div className="map-overlay">
        <button
          type="button"
          className="chip map-btn"
          onClick={() => map.current?.locate({ setView: true, maxZoom: 15 })}
        >
          📍 {t.map.nearMe}
        </button>
        {locError && <span className="map-note" role="alert">{t.map.locationError}</span>}
        {unlocated > 0 && <span className="map-note">{t.map.noLocation(unlocated)}</span>}
      </div>
    </div>
  );
}
