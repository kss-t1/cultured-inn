import { useEffect, useState } from "react";
import { CATEGORIES, type Category } from "../../shared/categories.ts";
import { t } from "../../shared/i18n/index.ts";
import { LANGUAGES, STATUSES, type EventStatus, type Language } from "../../shared/schemas.ts";
import { api, ApiError } from "../api.ts";
import { Checkbox, Field, listFromCsv, numOrNull, TextInput } from "../form.tsx";
import { navigate } from "../router.ts";

interface Option { id: number; name: string }

interface FormState {
  title: string;
  category: Category;
  start_local: string;
  end_local: string;
  venue_id: number | null;
  organizer_id: number | null;
  description: string;
  tags: string;
  price_min: string;
  price_max: string;
  is_free: boolean;
  language: Language;
  beginner_friendly: boolean;
  ticket_url: string;
  source_url: string;
  image_url: string;
  status: EventStatus;
}

const EMPTY: FormState = {
  title: "", category: "BOARDGAMES", start_local: "", end_local: "", venue_id: null, organizer_id: null,
  description: "", tags: "", price_min: "", price_max: "", is_free: false, language: "pl",
  beginner_friendly: false, ticket_url: "", source_url: "", image_url: "", status: "DRAFT",
};

function fromApi(e: any): FormState {
  return {
    ...EMPTY,
    ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, e[k] ?? (EMPTY as any)[k]])),
    tags: (e.tags ?? []).join(", "),
    price_min: e.price_min?.toString() ?? "",
    price_max: e.price_max?.toString() ?? "",
  };
}

function toApi(f: FormState) {
  return {
    ...f,
    end_local: f.end_local || null,
    tags: listFromCsv(f.tags),
    price_min: numOrNull(f.price_min),
    price_max: numOrNull(f.price_max),
    ticket_url: f.ticket_url || null,
    source_url: f.source_url || null,
    image_url: f.image_url || null,
  };
}

/** Select with an inline "+ new" mini form that creates the record and selects it. */
function PickerWithNew({ label, options, value, onChange, newLabel, create, error, withAddress = false }: {
  label: string;
  options: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  newLabel: string;
  create: (name: string, extra: string) => Promise<Option>;
  error?: string;
  withAddress?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Field label={label} error={error}>
      {(id) => (
        <div className="picker">
          <div className="picker-row">
            <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t.admin.none}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button type="button" className="btn small" onClick={() => setAdding(!adding)}>{newLabel}</button>
          </div>
          {adding && (
            <div className="inline-new">
              <input placeholder={withAddress ? t.admin.venues.fields.name : t.admin.organizers.fields.name}
                value={name} onChange={(e) => setName(e.target.value)} />
              {withAddress && (
                <input placeholder={t.admin.venues.fields.address} value={extra} onChange={(e) => setExtra(e.target.value)} />
              )}
              <button type="button" className="btn small primary" disabled={!name.trim()}
                onClick={async () => {
                  try {
                    const o = await create(name.trim(), extra.trim());
                    onChange(o.id);
                    setAdding(false);
                    setName("");
                    setExtra("");
                    setErr(null);
                  } catch (e) {
                    setErr((e as ApiError).text);
                  }
                }}>
                {t.admin.add}
              </button>
              {err && <small className="field-error">{err}</small>}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

function importInfo(e: any): { source: string | null; locked: boolean } | null {
  if (e.origin !== "IMPORTED") return null;
  return { source: e.source_key === "manual-url" ? t.admin.sources.manualName : e.source_name, locked: e.import_locked };
}

export function EventForm({ id }: { id: number | null }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [slug, setSlug] = useState<string | null>(null);
  const [venues, setVenues] = useState<Option[]>([]);
  const [organizers, setOrganizers] = useState<Option[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(id === null);
  const [imported, setImported] = useState<{ source: string | null; locked: boolean } | null>(null);

  useEffect(() => {
    api<Option[]>("GET", "/venues").then(setVenues);
    api<Option[]>("GET", "/organizers").then(setOrganizers);
    if (id !== null) {
      api("GET", `/events/${id}`).then((e) => {
        setF(fromApi(e));
        setSlug(e.slug);
        setImported(importInfo(e));
        setLoaded(true);
      }, (e: ApiError) => setMsg({ kind: "error", text: e.text }));
    }
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const saved = id === null ? await api("POST", "/events", toApi(f)) : await api("PUT", `/events/${id}`, toApi(f));
      setFields({});
      if (id === null) navigate(`/admin/events/${saved.id}`);
      else {
        setF(fromApi(saved));
        setSlug(saved.slug);
        setImported(importInfo(saved));
        setMsg({ kind: "ok", text: t.admin.saved });
      }
    } catch (err) {
      const ae = err as ApiError;
      setFields(ae.fields ?? {});
      setMsg({ kind: "error", text: ae.text });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (id === null || !confirm(t.admin.confirmDelete)) return;
    try {
      await api("DELETE", `/events/${id}`);
      navigate("/admin");
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).text });
    }
  }

  if (!loaded) return <p>{msg?.text ?? t.admin.loading}</p>;
  const F = t.admin.events.fields;

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="page-head">
        <h1>{id === null ? t.admin.events.new : t.admin.events.edit}</h1>
        {slug && (f.status === "PUBLISHED" || f.status === "CANCELLED") && (
          <a href={`/events/${slug}`} target="_blank" rel="noopener">{t.admin.preview} ↗</a>
        )}
      </div>

      {imported && (
        <p className="notice small">
          {t.admin.events.imported(imported.source ?? "—")}{" "}
          {imported.locked ? t.admin.events.importedLocked : t.admin.events.importedUnlocked}
        </p>
      )}

      <TextInput label={F.title} value={f.title} onChange={(v) => set("title", v)} error={fields.title} required />
      <div className="grid-2">
        <Field label={F.category} error={fields.category}>
          {(fid) => (
            <select id={fid} value={f.category} onChange={(e) => set("category", e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t.categories[c]}</option>)}
            </select>
          )}
        </Field>
        <Field label={F.status} error={fields.status}>
          {(fid) => (
            <select id={fid} value={f.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t.admin.statuses[s]}</option>)}
            </select>
          )}
        </Field>
        <TextInput label={F.start} type="datetime-local" value={f.start_local} onChange={(v) => set("start_local", v)}
          error={fields.start_local} required hint={t.admin.events.timesNote} />
        <TextInput label={F.end} type="datetime-local" value={f.end_local} onChange={(v) => set("end_local", v)}
          error={fields.end_local} min={f.start_local} />
        <PickerWithNew label={F.venue} options={venues} value={f.venue_id} onChange={(v) => set("venue_id", v)}
          newLabel={t.admin.events.newVenue} error={fields.venue_id} withAddress
          create={async (name, address) => {
            const v = await api("POST", "/venues", { name, address: address || null });
            setVenues((vs) => [...vs, v].sort((a, b) => a.name.localeCompare(b.name, t.locale)));
            return v;
          }} />
        <PickerWithNew label={F.organizer} options={organizers} value={f.organizer_id} onChange={(v) => set("organizer_id", v)}
          newLabel={t.admin.events.newOrganizer} error={fields.organizer_id}
          create={async (name) => {
            const o = await api("POST", "/organizers", { name });
            setOrganizers((os) => [...os, o].sort((a, b) => a.name.localeCompare(b.name, t.locale)));
            return o;
          }} />
      </div>

      <Field label={F.description} error={fields.description}>
        {(fid) => <textarea id={fid} rows={8} value={f.description} onChange={(e) => set("description", e.target.value)} />}
      </Field>
      <TextInput label={F.tags} value={f.tags} onChange={(v) => set("tags", v)} error={fields.tags} />

      <div className="grid-3">
        <TextInput label={F.priceMin} type="number" step="0.01" min="0" value={f.price_min}
          onChange={(v) => set("price_min", v)} error={fields.price_min} />
        <TextInput label={F.priceMax} type="number" step="0.01" min="0" value={f.price_max}
          onChange={(v) => set("price_max", v)} error={fields.price_max} />
        <Field label={F.language} error={fields.language}>
          {(fid) => (
            <select id={fid} value={f.language} onChange={(e) => set("language", e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{t.event.languages[l]}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className="checks">
        <Checkbox label={F.isFree} checked={f.is_free} onChange={(v) => set("is_free", v)} />
        <Checkbox label={F.beginner} checked={f.beginner_friendly} onChange={(v) => set("beginner_friendly", v)} />
      </div>

      <TextInput label={F.ticketUrl} type="url" value={f.ticket_url} onChange={(v) => set("ticket_url", v)} error={fields.ticket_url} />
      <TextInput label={F.sourceUrl} type="url" value={f.source_url} onChange={(v) => set("source_url", v)} error={fields.source_url} />
      <TextInput label={F.imageUrl} type="url" value={f.image_url} onChange={(v) => set("image_url", v)} error={fields.image_url} />

      {msg && <p className={msg.kind === "ok" ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>{busy ? t.admin.saving : t.admin.save}</button>
        <button type="button" className="btn" onClick={() => navigate("/admin")}>{t.admin.cancel}</button>
        {id !== null && <button type="button" className="btn danger" onClick={remove}>{t.admin.delete}</button>}
      </div>
    </form>
  );
}
