// Import sources: health (last run, status, errors, counts), "Run now", and the editor.
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "../../shared/categories.ts";
import { t } from "../../shared/i18n/index.ts";
import { SOURCE_KINDS_EDITABLE, TRUST_LEVELS } from "../../shared/schemas.ts";
import { api, ApiError } from "../api.ts";
import { Checkbox, Field, TextInput } from "../form.tsx";
import { linkProps, navigate } from "../router.ts";

interface Source {
  id: number;
  key: string | null;
  name: string;
  kind: string;
  url: string | null;
  adapter_name: string | null;
  config: Record<string, unknown>;
  default_category: Category | null;
  default_venue_id: number | null;
  default_organizer_id: number | null;
  trust: "AUTO_PUBLISH" | "REVIEW";
  enabled: boolean;
  schedule_hours: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  events_found: number;
  last_stats: { received?: number; skipped?: Record<string, number> } & Record<string, any>;
  running: boolean;
  upcoming_published?: number;
  upcoming_drafts?: number;
}

const S = t.admin.sources;
const dateFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: "Europe/Warsaw", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const displayName = (s: Pick<Source, "key" | "name">) => (s.key === "manual-url" ? S.manualName : s.name);

export function SourcesPage() {
  const [data, setData] = useState<{ sources: Source[]; apify: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<Timer | null>(null);

  const load = () =>
    api<{ sources: Source[]; apify: boolean }>("GET", "/sources").then((d) => {
      setData(d);
      // While something runs in the background, poll until it finishes.
      if (timer.current) clearTimeout(timer.current);
      if (d.sources.some((s) => s.running)) timer.current = setTimeout(load, 3000);
    }, (e: ApiError) => setErr(e.text));
  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function runNow(s: Source) {
    setErr(null);
    try {
      await api("POST", `/sources/${s.id}/run`);
      await load();
    } catch (e) {
      setErr((e as ApiError).text);
    }
  }

  async function toggle(s: Source) {
    try {
      const body = s.kind === "MANUAL_URL"
        ? { enabled: !s.enabled, schedule_hours: s.schedule_hours }
        : { ...toInput(s), enabled: !s.enabled };
      await api("PUT", `/sources/${s.id}`, body);
      await load();
    } catch (e) {
      setErr((e as ApiError).text);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{S.title}</h1>
        <a className="btn primary" {...linkProps("/admin/sources/new")}>{S.new}</a>
      </div>
      {data && <p className="muted small">{data.apify ? S.apifyOn : S.apifyOff}</p>}
      {err && <p className="form-error" role="alert">{err}</p>}
      {data === null ? <p>{t.admin.loading}</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{S.columns.name}</th>
                <th>{S.columns.lastRun}</th>
                <th>{S.columns.events}</th>
                <th>{S.columns.enabled}</th>
                <th><span className="sr-only">{t.admin.actions}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.kind === "MANUAL_URL" ? displayName(s) : <a {...linkProps(`/admin/sources/${s.id}`)}>{s.name}</a>}
                    <div className="muted small">{S.kinds[s.kind]} · {S.trust[s.trust]}</div>
                  </td>
                  <td>
                    {s.last_run_at ? dateFmt.format(new Date(s.last_run_at)) : S.never}{" "}
                    {s.last_status && <span className={`status status-run-${s.last_status}`}>{S.status[s.last_status] ?? s.last_status}</span>}
                    {s.last_stats?.received !== undefined && <div className="muted small">{S.stats(s.last_stats)}</div>}
                    {s.last_error && <details className="small"><summary>{S.details}</summary><pre className="error-text">{s.last_error}</pre></details>}
                  </td>
                  <td className="small">{S.upcoming(s.upcoming_published ?? 0, s.upcoming_drafts ?? 0)}</td>
                  <td><input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} aria-label={S.columns.enabled} /></td>
                  <td className="row-actions">
                    <button className="btn small" disabled={s.running} onClick={() => runNow(s)}>
                      {s.running ? S.running : S.runNow}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface Option { id: number; name: string }

interface FormState {
  name: string; key: string; kind: string; url: string; adapter_name: string; config: string;
  default_category: string; default_venue_id: number | null; default_organizer_id: number | null;
  trust: string; enabled: boolean; schedule_hours: string;
}

const EMPTY: FormState = {
  name: "", key: "", kind: "ICS", url: "", adapter_name: "", config: "{}", default_category: "",
  default_venue_id: null, default_organizer_id: null, trust: "AUTO_PUBLISH", enabled: true, schedule_hours: "24",
};

const fromApi = (s: Source): FormState => ({
  name: s.name, key: s.key ?? "", kind: s.kind, url: s.url ?? "", adapter_name: s.adapter_name ?? "",
  config: JSON.stringify(s.config ?? {}, null, 2), default_category: s.default_category ?? "",
  default_venue_id: s.default_venue_id, default_organizer_id: s.default_organizer_id,
  trust: s.trust, enabled: s.enabled, schedule_hours: String(s.schedule_hours),
});

const toInput = (s: Source) => formToApi(fromApi(s));

function formToApi(f: FormState) {
  let config: unknown;
  try {
    config = JSON.parse(f.config || "{}");
  } catch {
    config = "__invalid__"; // the API rejects it on the config field
  }
  return {
    name: f.name, key: f.key || null, kind: f.kind, url: f.url || null, adapter_name: f.adapter_name || null,
    config, default_category: f.default_category || null, default_venue_id: f.default_venue_id,
    default_organizer_id: f.default_organizer_id, trust: f.trust, enabled: f.enabled,
    schedule_hours: Number(f.schedule_hours),
  };
}

export function SourceForm({ id }: { id: number | null }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [venues, setVenues] = useState<Option[]>([]);
  const [organizers, setOrganizers] = useState<Option[]>([]);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Option[]>("GET", "/venues").then(setVenues);
    api<Option[]>("GET", "/organizers").then(setOrganizers);
    api<{ adapters: string[] }>("GET", "/sources").then((d) => setAdapters(d.adapters));
    if (id !== null) api<Source>("GET", `/sources/${id}`).then((s) => setF(fromApi(s)), (e: ApiError) => setMsg({ kind: "error", text: e.text }));
  }, [id]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const F = S.fields;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = formToApi(f);
      const saved = id === null ? await api<Source>("POST", "/sources", body) : await api<Source>("PUT", `/sources/${id}`, body);
      setFields({});
      if (id === null) navigate(`/admin/sources/${saved.id}`);
      else {
        setF(fromApi(saved));
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
      await api("DELETE", `/sources/${id}`);
      navigate("/admin/sources");
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).text });
    }
  }

  const select = (label: string, key: keyof FormState, options: [string, string][], error?: string) => (
    <Field label={label} error={error}>
      {(fid) => (
        <select id={fid} value={String(f[key] ?? "")} onChange={(e) => set(key, e.target.value as never)}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </Field>
  );
  const idSelect = (label: string, key: "default_venue_id" | "default_organizer_id", options: Option[]) => (
    <Field label={label}>
      {(fid) => (
        <select id={fid} value={f[key] ?? ""} onChange={(e) => set(key, e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t.admin.none}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </Field>
  );

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="page-head"><h1>{id === null ? S.new : S.edit}</h1></div>
      <div className="grid-2">
        <TextInput label={F.name} value={f.name} onChange={(v) => set("name", v)} error={fields.name} required />
        <TextInput label={F.key} value={f.key} onChange={(v) => set("key", v)} error={fields.key} />
      </div>
      <div className="grid-2">
        {select(F.kind, "kind", SOURCE_KINDS_EDITABLE.map((k) => [k, S.kinds[k] ?? k]), fields.kind)}
        {f.kind === "HTML_ADAPTER" && select(F.adapter, "adapter_name", [["", t.admin.none], ...adapters.map((a): [string, string] => [a, a])], fields.adapter_name)}
      </div>
      <TextInput label={F.url} type="url" value={f.url} onChange={(v) => set("url", v)} error={fields.url} />
      <div className="grid-3">
        {select(F.category, "default_category", [["", F.categoryNone], ...CATEGORIES.map((c): [string, string] => [c, t.categories[c]])])}
        {idSelect(F.venue, "default_venue_id", venues)}
        {idSelect(F.organizer, "default_organizer_id", organizers)}
      </div>
      <div className="grid-3">
        {select(F.trust, "trust", TRUST_LEVELS.map((k) => [k, S.trust[k] ?? k]))}
        <TextInput label={F.schedule} type="number" min="1" value={f.schedule_hours} onChange={(v) => set("schedule_hours", v)} error={fields.schedule_hours} />
        <div className="field"><span className="label-spacer" aria-hidden="true">&nbsp;</span><Checkbox label={F.enabled} checked={f.enabled} onChange={(v) => set("enabled", v)} /></div>
      </div>
      <Field label={F.config} error={fields.config} hint={F.configHint}>
        {(fid, describedBy) => (
          <textarea id={fid} rows={12} className="mono" value={f.config} aria-describedby={describedBy}
            onChange={(e) => set("config", e.target.value)} spellCheck={false} />
        )}
      </Field>
      {msg && <p className={msg.kind === "ok" ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>{busy ? t.admin.saving : t.admin.save}</button>
        <button type="button" className="btn" onClick={() => navigate("/admin/sources")}>{t.admin.cancel}</button>
        {id !== null && <button type="button" className="btn danger" onClick={remove}>{t.admin.delete}</button>}
      </div>
    </form>
  );
}
