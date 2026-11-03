// Markup shared by the public SPA pages and the server-rendered event page.
import type { ReactNode } from "react";
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

/** The dark "sign" header with the logo; `aside` sits at the right end. */
export function SiteHeader({ aside }: { aside?: ReactNode }) {
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
        {aside}
      </div>
    </header>
  );
}

export function SiteFooter({ note }: { note: string }) {
  return (
    <footer className="wrap foot">
      <p><strong>{t.brand.name}</strong> {t.brand.about}</p>
      <p>{note}</p>
    </footer>
  );
}
