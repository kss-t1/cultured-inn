import { useEffect, useState, type CSSProperties } from "react";
import { CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { t } from "../../shared/i18n/index.ts";
import { STATUSES, type EventStatus } from "../../shared/schemas.ts";
import { api, ApiError } from "../api.ts";
import { linkProps } from "../router.ts";

interface Row {
  id: number;
  title: string;
  slug: string;
  category: Category;
  status: EventStatus;
  start_at: string;
  venue_name: string | null;
}

const dateFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: "Europe/Warsaw", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

export function EventsPage() {
  const [scope, setScope] = useState("upcoming");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    const p = new URLSearchParams({ scope, ...(status && { status }), ...(q && { q }) });
    api<Row[]>("GET", `/events?${p}`).then(setRows, (e: ApiError) => setErr(e.text));
  };
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, status, q]);

  async function setRowStatus(row: Row, next: EventStatus) {
    try {
      await api("POST", `/events/${row.id}/status`, { status: next });
      setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, status: next } : r)) ?? null);
    } catch (e) {
      setErr((e as ApiError).text);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t.admin.events.title}</h1>
        <a className="btn primary" {...linkProps("/admin/events/new")}>{t.admin.events.new}</a>
      </div>
      <div className="toolbar">
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={t.admin.scopes.upcoming}>
          {(["upcoming", "past", "all"] as const).map((s) => <option key={s} value={s}>{t.admin.scopes[s]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.admin.events.columns.status}>
          <option value="">{t.admin.statusAll}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t.admin.statuses[s]}</option>)}
        </select>
        <input type="search" placeholder={t.admin.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.admin.search} />
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      {rows === null ? <p>{t.admin.loading}</p> : rows.length === 0 ? <p className="muted">{t.admin.empty}</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.admin.events.columns.start}</th>
                <th>{t.admin.events.columns.title}</th>
                <th>{t.admin.events.columns.venue}</th>
                <th>{t.admin.events.columns.status}</th>
                <th><span className="sr-only">{t.admin.actions}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{dateFmt.format(new Date(r.start_at))}</td>
                  <td>
                    <span className="cat-dot" style={{ "--cat": CATEGORY_INFO[r.category].color } as CSSProperties}
                      title={t.categories[r.category]} />
                    <a {...linkProps(`/admin/events/${r.id}`)}>{r.title}</a>
                  </td>
                  <td>{r.venue_name ?? "—"}</td>
                  <td><span className={`status status-${r.status}`}>{t.admin.statuses[r.status]}</span></td>
                  <td className="row-actions">
                    {r.status !== "PUBLISHED" && (
                      <button type="button" className="btn small" onClick={() => setRowStatus(r, "PUBLISHED")}>{t.admin.events.publish}</button>
                    )}
                    {r.status === "PUBLISHED" && (
                      <button type="button" className="btn small" onClick={() => setRowStatus(r, "HIDDEN")}>{t.admin.events.hide}</button>
                    )}
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
