// Server-rendered event detail page (/events/:slug) with schema.org Event JSON-LD.
import type { CSSProperties } from "react";
import { CATEGORY_INFO } from "../shared/categories.ts";
import { fmtDay, fmtEnd, fmtFull, fmtPrice } from "../shared/format.ts";
import { t } from "../shared/i18n/index.ts";
import type { EventDetail } from "../shared/types.ts";

export function eventJsonLd(e: EventDetail, url: string) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    url,
    startDate: e.start_at,
    ...(e.end_at && { endDate: e.end_at }),
    eventStatus: e.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(e.description && { description: e.description.slice(0, 500) }),
    ...(e.image_url && { image: [e.image_url] }),
    inLanguage: e.language === "both" ? ["pl", "en"] : e.language,
  };
  if (e.venue) {
    ld.location = {
      "@type": "Place",
      name: e.venue.name,
      address: {
        "@type": "PostalAddress",
        ...(e.venue.address && { streetAddress: e.venue.address }),
        addressLocality: "Poznań",
        addressCountry: "PL",
      },
      ...(e.venue.lat !== null && { geo: { "@type": "GeoCoordinates", latitude: e.venue.lat, longitude: e.venue.lon } }),
    };
  }
  if (e.organizer) {
    ld.organizer = { "@type": "Organization", name: e.organizer.name, ...(e.organizer_website && { url: e.organizer_website }) };
  }
  if (e.is_free || e.price_min !== null) {
    ld.offers = {
      "@type": "Offer",
      price: e.is_free ? 0 : e.price_min,
      priceCurrency: e.currency,
      ...(e.ticket_url && { url: e.ticket_url }),
      availability: "https://schema.org/InStock",
    };
  }
  return ld;
}

/** JSON for embedding in <script>: escape "<" so "</script>" in user text can't break out. */
export const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

function Paragraphs({ text }: { text: string }) {
  // Description is stored as markdown; M1 renders paragraphs and line breaks only (no raw HTML).
  return (
    <>
      {text.split(/\n{2,}/).filter((p) => p.trim()).map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <span key={j}>{j > 0 && <br />}{line}</span>
          ))}
        </p>
      ))}
    </>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function EventPage({ e, url }: { e: EventDetail; url: string }) {
  const cat = CATEGORY_INFO[e.category];
  const price = fmtPrice(e);
  const v = e.venue;
  const geo = v && v.lat !== null && v.lon !== null ? { lat: v.lat, lon: v.lon } : null;
  const d = 0.004;
  const mapSrc = geo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.lon - d},${geo.lat - d / 2},${geo.lon + d},${geo.lat + d / 2}&layer=mapnik&marker=${geo.lat},${geo.lon}`
    : null;
  const osmLink = geo ? `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=17/${geo.lat}/${geo.lon}` : null;

  return (
    <div className="page" style={{ "--cat": cat.color } as CSSProperties}>
      <header className="top">
        <a href="/" className="brand">{t.brand.nameFirst} <b>{t.brand.nameSecond}</b></a>
        <a href="/" className="back">{t.event.back}</a>
      </header>
      <main>
        <article className="event">
          {e.status === "CANCELLED" && <p className="cancelled" role="alert">{t.event.cancelledBanner}</p>}
          <p className="cat"><span aria-hidden="true">{cat.icon}</span> {t.categories[e.category]}</p>
          <h1>{e.title}</h1>
          <dl className="facts">
            <dt>{t.event.when}</dt>
            <dd>
              <time dateTime={e.start_at}>{fmtFull(e.start_at)}</time>
              {e.end_at && <> – {fmtEnd(e.start_at, e.end_at)}</>}
              {e.is_recurring && <span className="badge">{t.event.recurring}</span>}
            </dd>
            <dt>{t.event.where}</dt>
            <dd>
              {v ? (
                <>
                  {v.name}
                  {v.address && <><br /><span className="muted">{v.address}{v.district ? `, ${v.district}` : ""}</span></>}
                </>
              ) : t.list.venueTbd}
            </dd>
            {price && (<><dt>{t.event.price}</dt><dd>{price}</dd></>)}
            {e.organizer && (
              <>
                <dt>{t.event.organizer}</dt>
                <dd>{e.organizer_website ? <a href={e.organizer_website} rel="noopener">{e.organizer.name}</a> : e.organizer.name}</dd>
              </>
            )}
            <dt>{t.event.language}</dt>
            <dd>{t.event.languages[e.language]}</dd>
          </dl>
          {(e.beginner_friendly || e.tags.length > 0) && (
            <p className="badges">
              {e.beginner_friendly && <span className="badge good">{t.event.beginner}</span>}
              {e.tags.map((tag) => <span key={tag} className="badge">#{tag}</span>)}
            </p>
          )}
          <p className="actions">
            {e.ticket_url && <a className="btn primary" href={e.ticket_url} rel="noopener">{t.event.tickets}</a>}
            {e.source_url && e.source_url !== e.ticket_url && (
              <a className="btn" href={e.source_url} rel="noopener nofollow">{t.event.sourceLink(hostname(e.source_url))}</a>
            )}
            <a className="btn" href={`/events/${e.slug}.ics`} download>{t.event.addToCalendar}</a>
            <button className="btn" type="button" id="share" data-url={url} data-title={e.title} data-copied={t.event.linkCopied}>
              {t.event.share}
            </button>
          </p>
          {e.image_url && <img className="cover" src={e.image_url} alt="" loading="lazy" />}
          {e.description && <section className="desc"><Paragraphs text={e.description} /></section>}
          {mapSrc && osmLink && v && (
            <section className="map">
              <iframe title={t.event.mapTitle(v.name)} src={mapSrc} loading="lazy" />
              <a href={osmLink} rel="noopener">{t.event.bigMap}</a>
            </section>
          )}
          <footer className="meta muted">
            {t.event.updated}: {fmtDay(e.updated_at)}
          </footer>
        </article>
      </main>
    </div>
  );
}
