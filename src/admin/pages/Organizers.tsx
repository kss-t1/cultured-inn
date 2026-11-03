import { useEffect, useState } from "react";
import { t } from "../../shared/i18n/index.ts";
import { api, ApiError } from "../api.ts";
import { TextInput, Field } from "../form.tsx";
import { linkProps, navigate } from "../router.ts";

interface Row { id: number; name: string; website: string | null; event_count: number }

export function OrganizersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Row[]>("GET", "/organizers").then(setRows, (e: ApiError) => setErr(e.text));
  }, []);
  const F = t.admin.organizers.fields;
  return (
    <>
      <div className="page-head">
        <h1>{t.admin.organizers.title}</h1>
        <a className="btn primary" {...linkProps("/admin/organizers/new")}>{t.admin.organizers.new}</a>
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      {rows === null ? <p>{t.admin.loading}</p> : rows.length === 0 ? <p className="muted">{t.admin.empty}</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{F.name}</th><th>{F.website}</th><th>{t.admin.venues.eventCount}</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><a {...linkProps(`/admin/organizers/${o.id}`)}>{o.name}</a></td>
                  <td>{o.website ? <a href={o.website} target="_blank" rel="noopener">{o.website}</a> : "—"}</td>
                  <td>{o.event_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface FormState { name: string; website: string; facebook_url: string; instagram: string; contact_email: string; notes: string }
const EMPTY: FormState = { name: "", website: "", facebook_url: "", instagram: "", contact_email: "", notes: "" };
const fromApi = (o: any): FormState =>
  Object.fromEntries(Object.keys(EMPTY).map((k) => [k, o[k] ?? ""])) as unknown as FormState;
const toApi = (f: FormState) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === "name" ? v : v || null]));

export function OrganizerForm({ id }: { id: number | null }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id !== null) api("GET", `/organizers/${id}`).then((o) => setF(fromApi(o)), (e: ApiError) => setMsg({ kind: "error", text: e.text }));
  }, [id]);
  const set = (k: keyof FormState, v: string) => setF((s) => ({ ...s, [k]: v }));
  const F = t.admin.organizers.fields;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const saved = id === null ? await api("POST", "/organizers", toApi(f)) : await api("PUT", `/organizers/${id}`, toApi(f));
      setFields({});
      if (id === null) navigate(`/admin/organizers/${saved.id}`);
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
      await api("DELETE", `/organizers/${id}`);
      navigate("/admin/organizers");
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).text });
    }
  }

  return (
    <form className="editor" onSubmit={save} noValidate>
      <div className="page-head"><h1>{id === null ? t.admin.organizers.new : t.admin.organizers.edit}</h1></div>
      <TextInput label={F.name} value={f.name} onChange={(v) => set("name", v)} error={fields.name} required />
      <TextInput label={F.website} type="url" value={f.website} onChange={(v) => set("website", v)} error={fields.website} />
      <TextInput label={F.facebook} type="url" value={f.facebook_url} onChange={(v) => set("facebook_url", v)} error={fields.facebook_url} />
      <TextInput label={F.instagram} value={f.instagram} onChange={(v) => set("instagram", v)} error={fields.instagram} />
      <TextInput label={F.email} type="email" value={f.contact_email} onChange={(v) => set("contact_email", v)} error={fields.contact_email} />
      <Field label={F.notes} error={fields.notes}>
        {(fid) => <textarea id={fid} rows={4} value={f.notes} onChange={(e) => set("notes", e.target.value)} />}
      </Field>
      {msg && <p className={msg.kind === "ok" ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>{busy ? t.admin.saving : t.admin.save}</button>
        <button type="button" className="btn" onClick={() => navigate("/admin/organizers")}>{t.admin.cancel}</button>
        {id !== null && <button type="button" className="btn danger" onClick={remove}>{t.admin.delete}</button>}
      </div>
    </form>
  );
}
