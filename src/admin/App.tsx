import { useEffect, useState } from "react";
import { t } from "../shared/i18n/index.ts";
import { api, setUnauthorizedHandler } from "./api.ts";
import { EventForm } from "./pages/EventForm.tsx";
import { EventsPage } from "./pages/Events.tsx";
import { Login } from "./pages/Login.tsx";
import { OrganizerForm, OrganizersPage } from "./pages/Organizers.tsx";
import { ReviewPage } from "./pages/Review.tsx";
import { SourceForm, SourcesPage } from "./pages/Sources.tsx";
import { VenueForm } from "./pages/VenueForm.tsx";
import { VenuesPage } from "./pages/Venues.tsx";
import { linkProps, usePath } from "./router.ts";

type User = { id: number; email: string };

function route(path: string) {
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;
  if ((r = m(/^\/admin\/events\/(new|\d+)$/))) return <EventForm key={path} id={r[1] === "new" ? null : Number(r[1])} />;
  if (path === "/admin/review") return <ReviewPage />;
  if (path === "/admin/sources") return <SourcesPage />;
  if ((r = m(/^\/admin\/sources\/(new|\d+)$/))) return <SourceForm key={path} id={r[1] === "new" ? null : Number(r[1])} />;
  if (path === "/admin/venues") return <VenuesPage />;
  if ((r = m(/^\/admin\/venues\/(new|\d+)$/))) return <VenueForm key={path} id={r[1] === "new" ? null : Number(r[1])} />;
  if (path === "/admin/organizers") return <OrganizersPage />;
  if ((r = m(/^\/admin\/organizers\/(new|\d+)$/))) return <OrganizerForm key={path} id={r[1] === "new" ? null : Number(r[1])} />;
  return <EventsPage />;
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const path = usePath();

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api<{ user: User }>("GET", "/me").then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p className="loading">{t.admin.loading}</p>;
  if (user === null) return <Login onLogin={setUser} />;

  const nav = [
    { href: "/admin", label: t.admin.nav.events, active: path === "/admin" || path.startsWith("/admin/events") },
    { href: "/admin/review", label: t.admin.nav.review, active: path === "/admin/review" },
    { href: "/admin/sources", label: t.admin.nav.sources, active: path.startsWith("/admin/sources") },
    { href: "/admin/venues", label: t.admin.nav.venues, active: path.startsWith("/admin/venues") },
    { href: "/admin/organizers", label: t.admin.nav.organizers, active: path.startsWith("/admin/organizers") },
  ];

  return (
    <div className="admin">
      <header className="admin-header">
        <strong className="admin-brand">{t.brand.name}</strong>
        <nav aria-label={t.admin.title}>
          {nav.map((n) => (
            <a key={n.href} {...linkProps(n.href)} aria-current={n.active ? "page" : undefined}>{n.label}</a>
          ))}
          <a href="/" target="_blank" rel="noopener">{t.admin.nav.site} ↗</a>
        </nav>
        <span className="admin-user">
          {user.email}{" "}
          <button type="button" className="link-btn"
            onClick={() => api("POST", "/logout").finally(() => setUser(null))}>
            {t.admin.logout}
          </button>
        </span>
      </header>
      <main className="admin-main">{route(path)}</main>
    </div>
  );
}
