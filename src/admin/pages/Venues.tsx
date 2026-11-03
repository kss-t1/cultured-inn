import { useEffect, useState } from "react";
import { t } from "../../shared/i18n/index.ts";
import { api, ApiError } from "../api.ts";
import { linkProps } from "../router.ts";

interface VenueRow { id: number; name: string; address: string | null; district: string | null; lat: number | null; event_count: number }

export function VenuesPage() {
  const [rows, setRows] = useState<VenueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<VenueRow[]>("GET", "/venues").then(setRows, (e: ApiError) => setErr(e.text));
  }, []);
  const F = t.admin.venues.fields;
  return (
    <>
      <div className="page-head">
        <h1>{t.admin.venues.title}</h1>
        <a className="btn primary" {...linkProps("/admin/venues/new")}>{t.admin.venues.new}</a>
      </div>
      {err && <p className="form-error" role="alert">{err}</p>}
      {rows === null ? <p>{t.admin.loading}</p> : rows.length === 0 ? <p className="muted">{t.admin.empty}</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{F.name}</th><th>{F.address}</th><th>{F.district}</th><th>{t.admin.venues.eventCount}</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><a {...linkProps(`/admin/venues/${v.id}`)}>{v.name}</a>{v.lat === null && <span className="warn" title={F.lat}> ⚠</span>}</td>
                  <td>{v.address ?? "—"}</td>
                  <td>{v.district ?? "—"}</td>
                  <td>{v.event_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
