// Server-rendered event detail page (/events/:slug) with schema.org Event JSON-LD.
import type { ReactNode } from "react";
import { CATEGORY_INFO } from "../shared/categories.ts";
import { fmtDate, fmtLongDate, fmtPrice, fmtRange, isAllDay, spansDays } from "../shared/format.ts";
import { t } from "../shared/i18n/index.ts";
import type { IconName } from "../shared/icons.ts";
import type { EventDetail } from "../shared/types.ts";
import { Icon, SiteFooter, SiteHeader } from "../shared/ui.tsx";

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

/** One row of the ticket's fact list. */
function Fact({ icon, label, value, sub }: { icon: IconName; label: string; value: ReactNode; sub?: string | null }) {
  return (
    <li className="fact">
      <Icon name={icon} />
      <div>
        <span className="fact__k">{label}</span>
        <span className="fact__v">{value}</span>
        {sub && <span className="fact__s">{sub}</span>}
      </div>
    </li>
  );
}

export function EventPage({ e, url, now = new Date() }: { e: EventDetail; url: string; now?: Date }) {
  const cat = CATEGORY_INFO[e.category];
  const price = fmtPrice(e);
  const v = e.venue;
  const geo = v && v.lat !== null && v.lon !== null ? { lat: v.lat, lon: v.lon } : null;
  const d = 0.004;
  const mapSrc = geo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.lon - d},${geo.lat - d / 2},${geo.lon + d},${geo.lat + d / 2}&layer=mapnik&marker=${geo.lat},${geo.lon}`
    : null;
  const osmLink = geo ? `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=17/${geo.lat}/${geo.lon}` : null;
  const routeLink = geo ? `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lon}` : null;

  const cancelled = e.status === "CANCELLED";
  const endMs = e.end_at ? Date.parse(e.end_at) : Date.parse(e.start_at) + 3 * 3600_000;
  const past = !cancelled && endMs < now.getTime();
  const hours = isAllDay(e) ? t.list.allDay : fmtRange(e.start_at, e.end_at);
  const when = spansDays(e) ? fmtRange(e.start_at, e.end_at) : `${fmtLongDate(e.start_at)} · ${hours}`;
  const share = (
    <button className="btn btn--secondary" type="button" id="share" data-url={url} data-title={e.title} data-copied={t.event.linkCopied}>
      <Icon name="share" />{t.event.share}
    </button>
  );

  return (
    <>
      <SiteHeader aside={<a className="sign__link" href="/submit"><Icon name="plus" /><span className="sign__label">{t.submit.headerLink}</span></a>} />
      <main className="wrap">
        <article className={`ev cat-${cat.slug}${cancelled ? " is-cancelled" : ""}${past ? " is-past" : ""}`}>
          <a className="linkbtn ev__back" href="/"><Icon name="back" />{t.event.back}</a>

          <div className="ev__cover">
            {e.image_url ? (
              <figure className="cover"><img className="cover__img" src={e.image_url} alt="" /></figure>
            ) : (
              <div className="cover cover--none" aria-hidden="true"><span className="cover__seal"><Icon name={cat.icon} /></span></div>
            )}
          </div>

          <div className="ev__titleblock">
            {cancelled && (
              <div className="notice notice--danger" role="status">
                <span className="stamp">{t.event.cancelled}</span>
                <div><p className="notice__t">{t.event.cancelledTitle}</p><p>{t.event.cancelledHint}</p></div>
              </div>
            )}
            {past && (
              <div className="notice" role="status">
                <Icon name="info" />
                <div><p className="notice__t">{t.event.pastTitle}</p><p><a href="/">{t.event.pastLink}</a></p></div>
              </div>
            )}
            <div className="ev__badges">
              <span className="badge badge--cat badge--lg"><Icon name={cat.icon} />{t.categories[e.category]}</span>
              {e.beginner_friendly && <span className="badge badge--lg"><Icon name="sprout" />{t.event.beginner}</span>}
              {e.is_recurring && <span className="badge badge--lg"><Icon name="repeat" />{t.event.recurring}</span>}
              {past && <span className="badge badge--past badge--lg">{t.event.past}</span>}
              {e.tags.map((tag) => <span key={tag} className="badge badge--lg">#{tag}</span>)}
            </div>
            <h1 className="ev__title">{e.title}</h1>
            <p className="ev__sub"><time dateTime={e.start_at}>{when}</time></p>
          </div>

          <aside className="ev__aside" aria-label={t.event.details}>
            <div className="ticket">
              <ul className="ticket__facts">
                <Fact icon="cal" label={t.event.when} value={fmtLongDate(e.start_at)} sub={hours} />
                <Fact icon="pin" label={t.event.where} value={v ? v.name : t.list.venueTbd}
                  sub={v?.address ? [v.address, v.district].filter(Boolean).join(", ") : null} />
                {e.organizer && (
                  <Fact icon="user" label={t.event.organizer}
                    value={e.organizer_website ? <a href={e.organizer_website} rel="noopener">{e.organizer.name}</a> : e.organizer.name} />
                )}
                {price && <Fact icon="coin" label={t.event.price} value={price} />}
                <Fact icon="globe" label={t.event.language} value={t.event.languages[e.language]} />
              </ul>
              <div className="ticket__actions">
                {cancelled ? (
                  <button type="button" className="btn btn--primary btn--lg btn--block" disabled>{t.event.closed}</button>
                ) : past ? (
                  <a className="btn btn--primary btn--lg btn--block" href="/">{t.event.upcoming}</a>
                ) : e.ticket_url && (
                  <a className="btn btn--primary btn--lg btn--block" href={e.ticket_url} rel="noopener">
                    <Icon name="ticket" />{t.event.tickets}<Icon name="ext" size="sm" />
                    <span className="sr-only">{t.event.opensOrganizer}</span>
                  </a>
                )}
                <div className="ticket__row">
                  {!cancelled && !past && (
                    <a className="btn btn--secondary" href={`/events/${e.slug}.ics`} download><Icon name="calplus" />{t.event.addToCalendar}</a>
                  )}
                  {share}
                </div>
                <p className="ticket__src">
                  {e.source_url && (
                    <span>{t.event.source} <a href={e.source_url} rel="noopener nofollow">{hostname(e.source_url)}</a></span>
                  )}
                  <span>{e.source_url && "· "}{t.event.updated(fmtDate(e.updated_at))}</span>
                </p>
              </div>
            </div>

            {mapSrc && osmLink && routeLink && v && (
              <div className="mapcard">
                <div className="map map--mini">
                  <iframe title={t.event.mapTitle(v.name)} src={mapSrc} loading="lazy" />
                </div>
                <div className="mapcard__links">
                  <a href={osmLink} rel="noopener">{t.event.bigMap}</a>
                  <a href={routeLink} rel="noopener">{t.event.directions}</a>
                </div>
              </div>
            )}
          </aside>

          {e.description && (
            <section className="ev__desc">
              <h2>{t.event.about}</h2>
              <div className="ev__text"><Paragraphs text={e.description} /></div>
            </section>
          )}
        </article>
      </main>
      <SiteFooter note={t.event.footer} />
    </>
  );
}
