// Small form helpers shared by the admin editors.
import { useId, type ReactNode } from "react";
import { fieldMessage } from "./api.ts";

export function Field({ label, error, children, hint }: {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const msg = fieldMessage(error);
  return (
    <div className={`field${msg ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, msg ? errId : undefined)}
      {hint && <small className="hint">{hint}</small>}
      {msg && <small id={errId} className="field-error">{msg}</small>}
    </div>
  );
}

export function TextInput({ label, value, onChange, error, type = "text", required, hint, ...rest }: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <input id={id} type={type} value={value ?? ""} required={required}
          aria-invalid={!!error} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** "" -> null, otherwise a number (NaN stays NaN so the API reports it). */
export const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(",", ".")));
export const listFromCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
