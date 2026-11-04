// Markup shared by the public SPA pages and the server-rendered event page.
import { t } from "./i18n/index.ts";
import { ICONS, LOGO_PATHS, type IconName } from "./icons.ts";

// The SVG markup is the constant icon set, never user data.
export function Icon({ name, size, className }: { name: IconName; size?: "sm" | "lg"; className?: string }) {
  const cls = ["ico", size && `ico--${size}`, className].filter(Boolean).join(" ");
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

const NAV: { page: "submit"; href: string; icon: IconName; label: string; short: string }[] = [
  { page: "submit", href: "/submit", icon: "plus", label: t.submit.headerLink, short: t.submit.headerShort },
];

/** The dark "sign" header: logo on the left, then the city badge and site links (`current` marks one). */
export function SiteHeader({ current }: { current?: "submit" }) {
  return (
    <header className="sign">
      <div className="wrap sign__in">
        <a className="brand" href="/" aria-label={t.brand.homeLabel}>
          <svg className="brand__mark" viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_PATHS }} />
          <span className="brand__text">
            <span className="brand__name">{t.brand.name}</span>
            <span className="brand__tag">{t.brand.tagline}</span>
          </span>
        </a>
        <p className="sign__aside">
          <span className="sign__about">{t.brand.guide}</span>
          <span className="city">
            <Icon name="pin" size="sm" />
            {t.brand.city}
          </span>
        </p>
        <nav className="sign__nav" aria-label={t.brand.navLabel}>
          {NAV.map((n) => (
            <a key={n.page} className="sign__link" href={n.href} aria-label={n.label}
              aria-current={current === n.page ? "page" : undefined}>
              <Icon name={n.icon} /><span className="sign__label">{n.label}</span><span className="sign__short">{n.short}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ note }: { note: string }) {
  return (
    <footer className="wrap foot">
      <p><strong>{t.brand.name}</strong> {t.brand.about}</p>
      <p>{note}</p>
      <a className="linkbtn foot__about" href="/about"><Icon name="user" />{t.about.title}</a>
    </footer>
  );
}
