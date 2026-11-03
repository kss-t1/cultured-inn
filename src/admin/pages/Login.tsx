import { useState } from "react";
import { t } from "../../shared/i18n/index.ts";
import { api, ApiError } from "../api.ts";

export function Login({ onLogin }: { onLogin: (u: { id: number; email: string }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ user: { id: number; email: string } }>("POST", "/login", { email, password });
      onLogin(r.user);
    } catch (e) {
      setErr(e instanceof ApiError ? e.text : t.errors.generic!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>{t.brand.name}</h1>
        <p className="muted">{t.admin.title}</p>
        <label>{t.admin.email}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>{t.admin.password}
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? t.admin.loggingIn : t.admin.login}</button>
      </form>
    </main>
  );
}
