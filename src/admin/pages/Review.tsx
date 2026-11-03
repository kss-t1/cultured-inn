// Review queue: imported drafts and flagged events, with bulk publish/hide, merge into a
// duplicate, and "import from URL".
import { useEffect, useState, type CSSProperties } from "react";
import { CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { t } from "../../shared/i18n/index.ts";
import type { EventStatus } from "../../shared/schemas.ts";
import { api, ApiError } from "../api.ts";
import { linkProps, navigate } from "../router.ts";

interface Duplicate { id: number; title: string; status: EventStatus; start_at: string; venue_name: string | null; sim: number }
interface Row {
  id: number;
  title: string;
  category: Category;
  status: EventStatus;
  start_at: string;
  review_flags: string[];
  source_url: string | null;
  venue_name: string | null;
  source_name: string | null;
  source_key: string | null;
  location_text: string | null;
  submitted: boolean;
  contact_name: string | null;
  contact_email: string | null;
  duplicates: Duplicate[];
}

const dateFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: "Europe/Warsaw", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const R = t.admin.review;

export function ReviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<Row[]>("GET", "/review").then(setRows, (e: ApiError) => setErr(e.text));
  useEffect(() => {
    load();
  }, []);

  async function act(ids: number[], action: "publish" | "hide" | "dismiss_flags") {
    setBusy(true);
    setErr(null);
    try {
      await api("POST", "/review/bulk", { ids, action });
      setSelected(new Set());
      await load();
    } catch (e) {
      setErr((e as ApiError).text);
    } finally {
      setBusy(false);
    }
  }

  async function merge(row: Row, into: Duplicate) {
    if (!confirm(R.confirmMerge(into.title))) return;
    try {
      await api("POST", `/events/${row.id}/merge`, { into: into.id });
      await load();
    } catch (e) {
      setErr((e as ApiError).text);
    }
  }

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sourceName = (r: Row) => (r.source_key === "manual-url" ? t.admin.sources.manualName : r.source_name);

  return (
    <>
      <div className="page-head">
        <h1>{R.title}</h1>
      </div>
      <p className="muted">{R.intro}</p>
      <ImportUrlBox />
      {err && <p className="form-error" role="alert">{err}</p>}
      {rows === null ? <p>{t.admin.loading}</p> : rows.length === 0 ? <p className="muted">{R.empty}</p> : (
        <>
          <div className="toolbar bulk-bar">
            <label className="checkbox">
              <input type="checkbox" checked={selected.size === rows.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              {R.selectAll}
            </label>
            {selected.size > 0 && (
              <>
                <span className="muted">{R.selected(selected.size)}</span>
                <button className="btn small" disabled={busy} onClick={() => act([...selected], "publish")}>{R.publish}</button>
                <button className="btn small" disabled={busy} onClick={() => act([...selected], "hide")}>{R.hide}</button>
                <button className="btn small" disabled={busy} onClick={() => act([...selected], "dismiss_flags")}>{R.dismiss}</button>
              </>
            )}
          </div>
          <ul className="review-list">
            {rows.map((r) => (
              <li key={r.id} className="review-item">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.title} />
                <div className="review-body">
                  <div className="review-title">
                    <span className="cat-dot" style={{ "--cat": CATEGORY_INFO[r.category].color } as CSSProperties}
                      title={t.categories[r.category]} />
                    <a {...linkProps(`/admin/events/${r.id}`)}>{r.title}</a>{" "}
                    <span className={`status status-${r.status}`}>{t.admin.statuses[r.status]}</span>
                    {r.review_flags.map((f) => <span key={f} className="flag">{R.flags[f] ?? f}</span>)}
                  </div>
                  <div className="muted small">
                    {dateFmt.format(new Date(r.start_at))} · {r.venue_name ?? (r.location_text ? `${R.location}: ${r.location_text}` : t.list.venueTbd)}
                    {sourceName(r) && <> · {R.source}: {r.source_url ? <a href={r.source_url} target="_blank" rel="noopener">{sourceName(r)}</a> : sourceName(r)}</>}
                  </div>
                  {r.submitted && (
                    <div className="muted small">
                      {r.contact_name || r.contact_email ? <>{R.submittedBy}: {r.contact_name}{" "}
                        {r.contact_email && <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>}</> : R.submittedAnon}
                      {r.source_url && <> · <a href={r.source_url} target="_blank" rel="noopener">{r.source_url}</a></>}
                    </div>
                  )}
                  {r.duplicates.length > 0 && (
                    <div className="dups small">
                      {R.duplicates}
                      <ul>
                        {r.duplicates.map((d) => (
                          <li key={d.id}>
                            <a {...linkProps(`/admin/events/${d.id}`)}>{d.title}</a>{" "}
                            <span className="muted">({dateFmt.format(new Date(d.start_at))}{d.venue_name ? `, ${d.venue_name}` : ""}, {t.admin.statuses[d.status]}, {Math.round(d.sim * 100)}%)</span>{" "}
                            <button type="button" className="link-btn" onClick={() => merge(r, d)}>{R.merge}</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="row-actions">
                  {r.status !== "PUBLISHED" && <button className="btn small" disabled={busy} onClick={() => act([r.id], "publish")}>{R.publish}</button>}
                  {r.status !== "HIDDEN" && <button className="btn small" disabled={busy} onClick={() => act([r.id], "hide")}>{R.hide}</button>}
                  {r.review_flags.length > 0 && r.status !== "DRAFT" && (
                    <button className="btn small" disabled={busy} onClick={() => act([r.id], "dismiss_flags")}>{R.dismiss}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ImportUrlBox() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ eventId: number; created: boolean }>("POST", "/import-url", { url });
      if (!r.created) alert(R.importedExisting);
      navigate(`/admin/events/${r.eventId}`);
    } catch (err) {
      setMsg((err as ApiError).text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="import-url" onSubmit={submit}>
      <label htmlFor="import-url" className="sr-only">{R.importUrl}</label>
      <input id="import-url" type="url" value={url} placeholder={R.importUrlPlaceholder} onChange={(e) => setUrl(e.target.value)} />
      <button className="btn primary" disabled={busy}>{busy ? R.importing : R.importUrl}</button>
      {msg && <p className="form-error" role="alert">{msg}</p>}
    </form>
  );
}
