// Public routes: GET /api/events, /events/:slug (server-rendered) and /events/:slug.ics
import type { BunRequest } from "bun";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { getEventBySlug, queryEvents } from "../lib/events.ts";
import { buildIcs } from "../lib/ics.ts";
import { error, escapeHtml, handleError, json } from "../lib/http.ts";
import { parseFilters } from "../shared/filters.ts";
import { t } from "../shared/i18n/index.ts";
import { EventPage, eventJsonLd, safeJson } from "./EventPage.tsx";
import { SiteHeader } from "../shared/ui.tsx";
import siteCss from "../site/styles.css" with { type: "text" };

export const baseUrl = () => (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function apiEvents(req: Request) {
  try {
    const filters = parseFilters(new URL(req.url).searchParams);
    const events = await queryEvents(filters);
    return json({ events }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e) {
    return handleError(e);
  }
}

// Share button: Web Share API, falling back to copying the link.
const SHARE_JS = `document.getElementById("share")?.addEventListener("click",async e=>{const b=e.currentTarget,u=b.dataset.url;try{if(navigator.share){await navigator.share({title:b.dataset.title,url:u})}else{await navigator.clipboard.writeText(u);b.textContent=b.dataset.copied}}catch{}});`;

// Head links shared with src/site/index.html: colour scheme, favicon, the design fonts.
const HEAD_LINKS =
  `<meta name="color-scheme" content="light dark"><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
  `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..700,0..100;1,9..144,400..700,0..100&amp;family=Source+Sans+3:ital,wght@0,400..700;1,400..700&amp;display=swap">`;

function htmlPage(title: string, head: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="${t.htmlLang}" class="kk"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title>${head}${HEAD_LINKS}<style>${siteCss}</style></head><body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function eventPage(req: BunRequest<"/events/:slug">) {
  try {
    let slug = req.params.slug;
    const wantsIcs = slug.endsWith(".ics");
    if (wantsIcs) slug = slug.slice(0, -4);
    const e = await getEventBySlug(slug);
    if (!e) {
      return htmlPage(
        `${t.event.notFoundPageTitle} – ${t.brand.name}`,
        `<meta name="robots" content="noindex">`,
        renderToString(createElement(SiteHeader)) +
          `<main class="wrap views"><div class="empty"><h1 class="empty__title">${escapeHtml(t.event.notFoundTitle)}</h1>` +
          `<a class="btn btn--primary" href="/">${escapeHtml(t.event.notFoundBack)}</a></div></main>`,
        404,
      );
    }
    const url = `${baseUrl()}/events/${e.slug}`;

    if (wantsIcs) {
      const location = e.venue ? [e.venue.name, e.venue.address, "Poznań"].filter(Boolean).join(", ") : null;
      const ics = buildIcs(
        [{
          uid: `event-${e.id}@cultured-inn`,
          title: e.title,
          description: [e.description.slice(0, 1000), url].filter(Boolean).join("\n\n"),
          location,
          url,
          start: new Date(e.start_at),
          end: e.end_at ? new Date(e.end_at) : null,
          cancelled: e.status === "CANCELLED",
          updated: new Date(e.updated_at),
        }],
        e.title,
      );
      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${e.slug}.ics"`,
        },
      });
    }

    const description = (e.description || `${e.title} – ${e.venue?.name ?? "Poznań"}`).replace(/\s+/g, " ").slice(0, 160);
    const head =
      `<meta name="description" content="${escapeHtml(description)}">` +
      `<link rel="canonical" href="${escapeHtml(url)}">` +
      `<meta property="og:type" content="website">` +
      `<meta property="og:site_name" content="${escapeHtml(t.brand.name)}">` +
      `<meta property="og:title" content="${escapeHtml(e.title)}">` +
      `<meta property="og:description" content="${escapeHtml(description)}">` +
      `<meta property="og:url" content="${escapeHtml(url)}">` +
      (e.image_url ? `<meta property="og:image" content="${escapeHtml(e.image_url)}">` : "") +
      `<script type="application/ld+json">${safeJson(eventJsonLd(e, url))}</script>`;
    const body = renderToString(createElement(EventPage, { e, url })) + `<script>${SHARE_JS}</script>`;
    return htmlPage(`${e.title} – ${t.brand.name}`, head, body);
  } catch (err) {
    return handleError(err);
  }
}

export const publicRoutes = {
  "/api/events": { GET: apiEvents },
  "/api/*": () => error(404, "not_found"),
  "/events/:slug": { GET: eventPage },
};
