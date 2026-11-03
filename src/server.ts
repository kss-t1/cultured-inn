// Single Bun process: public SPA, admin SPA, server-rendered event pages and JSON APIs.
import site from "./site/index.html";
import submitPage from "./site/submit.html";
import adminApp from "./admin/index.html";
import { adminRoutes } from "./routes/admin.ts";
import { adminImportRoutes } from "./routes/adminImports.ts";
import { publicRoutes } from "./routes/public.ts";
import { submitRoutes } from "./routes/submit.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import favicon from "./site/favicon.svg" with { type: "text" };

const isProd = process.env.NODE_ENV === "production";

export const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  // Import from URL waits on Facebook (rate-limited to one request per 4 s).
  idleTimeout: 60,
  development: !isProd && { hmr: true, console: true },
  routes: {
    "/": site,
    "/submit": submitPage,
    "/admin": adminApp,
    "/admin/*": adminApp,
    ...publicRoutes,
    ...submitRoutes,
    ...adminRoutes,
    ...adminImportRoutes,
    "/healthz": () => new Response("ok"),
    // For the server-rendered pages; the SPA pages bundle the same file.
    "/favicon.svg": () =>
      new Response(favicon, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } }),
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
  error(err) {
    console.error(err);
    return Response.json({ error: "server_error" }, { status: 500 });
  },
});

console.log(`cultured-inn listening on ${server.url}`);
startScheduler();
