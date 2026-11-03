import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { t } from "../../shared/i18n/index.ts";
import { api, ApiError } from "../api.ts";
import { Checkbox, listFromCsv, numOrNull, TextInput } from "../form.tsx";
import { navigate } from "../router.ts";

const POZNAN: L.LatLngTuple = [52.4064, 16.9252];

interface FormState {
  name: string; address: string; district: string; lat: string; lon: string;
  website: string; facebook_url: string; is_approximate_location: boolean; aliases: string;
}
const EMPTY: FormState = {
  name: "", address: "", district: "", lat: "", lon: "", website: "", facebook_url: "",
  is_approximate_location: false, aliases: "",
};
interface Hit { display_name: string; lat: number; lon: number; district: string | null }

const fromApi = (v: any): FormState => ({
  name: v.name ?? "", address: v.address ?? "", district: v.district ?? "",
  lat: v.lat?.toString() ?? "", lon: v.lon?.toString() ?? "",
  website: v.website ?? "", facebook_url: v.facebook_url ?? "",
  is_approximate_location: !!v.is_approximate_location, aliases: (v.aliases ?? []).join(", "),
});
const toApi = (f: FormState) => ({
  name: f.name, address: f.address || null, district: f.district || null,
  lat: numOrNull(f.lat), lon: numOrNull(f.lon),
  website: f.website || null, facebook_url: f.facebook_url || null,
  is_approximate_location: f.is_approximate_location, aliases: listFromCsv(f.aliases),
});

/** Map preview with a draggable pin that writes back to the lat/lon fields. */
function PinMap({ lat, lon, onMove }: { lat: number | null; lon: number | null; onMove: (lat: number, lon: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | L.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const m = L.map(el.current!, { center: POZNAN, zoom: 12 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: t.map.attribution }).addTo(m);
    m.on("click", (e) => onMoveRef.current(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)));
    map.current = m;
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const m = map.current!;
    marker.current?.remove();
    marker.current = null;
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const icon = L.divIcon({ className: "pin-wrap", html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 12] });
    const mk = L.marker([lat, lon], { draggable: true, icon }).addTo(m);
    mk.on("dragend", () => {
      const p = mk.getLatLng();
      onMoveRef.current(+p.lat.toFixed(6), +p.lng.toFixed(6));
    });
    marker.current = mk;
    m.setView([lat, lon], Math.max(m.getZoom(), 16));
  }, [lat, lon]);

  return <div ref={el} className="pin-map" />;
}

export function VenueForm({ id }: { id: number | null }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (id !== null) api("GET", `/venues/${id}`).then((v) => setF(fromApi(v)), (e: ApiError) => setMsg({ kind: "error", text: e.text }));
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const F = t.admin.venues.fields;

  async function runGeocode() {
    setGeocoding(true);
    setHits(null);
    try {
      const q = [f.address || f.name, /poznań|poznan/i.test(f.address) ? "" : "Poznań"].filter(Boolean).join(", ");
      setHits(await api<Hit[]>("GET", `/geocode?q=${encodeURIComponent(q)}`));
    } catch (e) {
      setMsg({ kind: "error", text: (e as ApiError).text });
    } finally {
      setGeocoding(false);
    }
  }

  function pickHit(h: Hit) {
    setF((s) => ({ ...s, lat: String(h.lat), lon: String(h.lon), district: s.district || h.district || "" }));
    setHits(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const saved = id === null ? await api("POST", "/venues", toApi(f)) : await api("PUT", `/venues/${id}`, toApi(f));
      setFields({});
      if (id === null) navigate(`/admin/venues/${saved.id}`);
      else {
        setF(fromApi(saved));
        setMsg({ kind: "ok", text: t.admin.saved });
      }
    } catch (err) {
      const ae = err as ApiError;
      setFields(ae.fields);
      setMsg({ kind: "error", text: ae.text });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (id === null || !confirm(t.admin.confirmDelete)) return;
    try {
      await api("DELETE", `/venues/${id}`);
      navigate("/admin/venues");
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).text });
    }
  }

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="page-head"><h1>{id === null ? t.admin.venues.new : t.admin.venues.edit}</h1></div>
      <TextInput label={F.name} value={f.name} onChange={(v) => set("name", v)} error={fields.name} required />
      <TextInput label={F.address} value={f.address} onChange={(v) => set("address", v)} error={fields.address} />
      <div className="geocode">
        <button type="button" className="btn" onClick={runGeocode} disabled={geocoding || !(f.address || f.name)}>
          {geocoding ? t.admin.venues.geocoding : t.admin.venues.geocode}
        </button>
        {hits && (hits.length === 0 ? <p className="muted">{t.admin.venues.noResults}</p> : (
          <div className="hits">
            <p className="muted">{t.admin.venues.pickResult}</p>
            <ul>
              {hits.map((h, i) => (
                <li key={i}><button type="button" className="link-btn" onClick={() => pickHit(h)}>{h.display_name}</button></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="grid-3">
        <TextInput label={F.district} value={f.district} onChange={(v) => set("district", v)} error={fields.district} />
        <TextInput label={F.lat} value={f.lat} onChange={(v) => set("lat", v)} error={fields.lat} />
        <TextInput label={F.lon} value={f.lon} onChange={(v) => set("lon", v)} error={fields.lon} />
      </div>
      <PinMap lat={numOrNull(f.lat)} lon={numOrNull(f.lon)}
        onMove={(lat, lon) => setF((s) => ({ ...s, lat: String(lat), lon: String(lon) }))} />
      <small className="hint">{t.admin.venues.mapHint}</small>
      <Checkbox label={F.approximate} checked={f.is_approximate_location} onChange={(v) => set("is_approximate_location", v)} />
      <TextInput label={F.aliases} value={f.aliases} onChange={(v) => set("aliases", v)} error={fields.aliases} />
      <TextInput label={F.website} type="url" value={f.website} onChange={(v) => set("website", v)} error={fields.website} />
      <TextInput label={F.facebook} type="url" value={f.facebook_url} onChange={(v) => set("facebook_url", v)} error={fields.facebook_url} />

      {msg && <p className={msg.kind === "ok" ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>{busy ? t.admin.saving : t.admin.save}</button>
        <button type="button" className="btn" onClick={() => navigate("/admin/venues")}>{t.admin.cancel}</button>
        {id !== null && <button type="button" className="btn danger" onClick={remove}>{t.admin.delete}</button>}
      </div>
    </form>
  );
}
