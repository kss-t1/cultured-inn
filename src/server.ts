// Single Bun process: public SPA, admin SPA, server-rendered event pages and JSON APIs.
import site from "./site/index.html";
import adminApp from "./admin/index.html";
import { adminRoutes } from "./routes/admin.ts";
import { adminImportRoutes } from "./routes/adminImports.ts";
import { publicRoutes } from "./routes/public.ts";
import { startScheduler } from "./jobs/scheduler.ts";

const isProd = process.env.NODE_ENV === "production";

export const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  // Import from URL waits on Facebook (rate-limited to one request per 4 s).
  idleTimeout: 60,
  development: !isProd && { hmr: true, console: true },
  routes: {
    "/": site,
    "/admin": adminApp,
    "/admin/*": adminApp,
    ...publicRoutes,
    ...adminRoutes,
    ...adminImportRoutes,
    "/healthz": () => new Response("ok"),
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
