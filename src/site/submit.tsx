// Public "Zgłoś wydarzenie" page (/submit). Posts to /api/submit; the event waits for an admin.
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CATEGORIES } from "../shared/categories.ts";
import { t } from "../shared/i18n/index.ts";
import { Icon, SiteFooter, SiteHeader } from "../shared/ui.tsx";

const S = t.submit;
const F = S.fields;

const EMPTY = {
  title: "", category: "", start_local: "", end_local: "", location: "", description: "", link: "",
  is_free: false, beginner_friendly: false, contact_name: "", contact_email: "", website: "",
};
type Form = typeof EMPTY;

function SubmitPage() {
  const [f, setF] = useState<Form>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFields({});
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, category: f.category || undefined }),
      });
      if (res.ok) {
        setDone(true);
        setF(EMPTY);
        scrollTo(0, 0);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setFields(data.fields ?? {});
      setErr(t.errors[data.error] ?? t.errors.generic!);
    } catch {
      setErr(t.errors.network!);
    } finally {
      setBusy(false);
    }
  }

  const field = (name: keyof Form, label: string, input: ReactNode, hint?: string) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {input}
      {hint && <small className="muted small">{hint}</small>}
      {fields[name] && <small className="field-error" id={`${name}-error`}>{t.fieldErrors[fields[name]] ?? t.fieldErrors.invalid}</small>}
    </div>
  );
  const text = (name: keyof Form, type = "text", extra: Record<string, unknown> = {}) => (
    <input id={name} name={name} type={type} className="input" value={f[name] as string} onChange={(e) => set(name, e.target.value)}
      aria-invalid={fields[name] ? true : undefined} aria-describedby={fields[name] ? `${name}-error` : undefined} {...extra} />
  );

  return (
    <>
      <SiteHeader current="submit" />
      <main className="wrap submit-page">
        <h1>{S.title}</h1>
        {done ? (
          <div className="notice" role="status">
            <Icon name="check" />
            <div className="notice__body">
              <h2 className="notice__t">{S.thanksTitle}</h2>
              <p>{S.thanks}</p>
              <button type="button" className="btn btn--secondary" onClick={() => setDone(false)}>{S.another}</button>
            </div>
          </div>
        ) : (
          <form className="submit-form" onSubmit={send} noValidate>
            <p className="muted">{S.intro}</p>
            {field("title", F.title, text("title", "text", { required: true, maxLength: 200 }))}
            {field("category", F.category, (
              <select id="category" className="input" value={f.category} onChange={(e) => set("category", e.target.value)} required
                aria-invalid={fields.category ? true : undefined}>
                <option value="">{F.categoryPick}</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t.categories[c]}</option>)}
              </select>
            ))}
            <div className="field-pair">
              {field("start_local", F.start, text("start_local", "datetime-local", { required: true }), S.timesNote)}
              {field("end_local", F.end, text("end_local", "datetime-local", { min: f.start_local || undefined }))}
            </div>
            {field("location", F.location, text("location", "text", { required: true, maxLength: 300 }))}
            {field("link", F.link, text("link", "url", { inputMode: "url", placeholder: "https://" }))}
            {field("description", F.description, (
              <textarea id="description" className="input" rows={5} maxLength={5000} value={f.description}
                onChange={(e) => set("description", e.target.value)} />
            ))}
            <label className="check">
              <input type="checkbox" checked={f.is_free} onChange={(e) => set("is_free", e.target.checked)} /> {F.isFree}
            </label>
            <label className="check">
              <input type="checkbox" checked={f.beginner_friendly} onChange={(e) => set("beginner_friendly", e.target.checked)} /> {F.beginner}
            </label>
            <fieldset>
              <legend>{S.contact}</legend>
              <p className="muted small">{S.contactHint}</p>
              <div className="field-pair">
                {field("contact_name", F.contactName, text("contact_name", "text", { autoComplete: "name", maxLength: 200 }))}
                {field("contact_email", F.contactEmail, text("contact_email", "email", { autoComplete: "email" }))}
              </div>
            </fieldset>
            <div className="hp" aria-hidden="true">
              <label htmlFor="website">{F.website}</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={f.website}
                onChange={(e) => set("website", e.target.value)} />
            </div>
            {err && <p className="field-error" role="alert">{err}</p>}
            <button className="btn btn--primary" disabled={busy}>{busy ? S.sending : S.send}</button>
          </form>
        )}
      </main>
      <SiteFooter note={t.brand.sources} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<SubmitPage />);
