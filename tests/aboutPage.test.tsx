import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { AboutPage } from "../src/routes/AboutPage.tsx";
import { publicRoutes } from "../src/routes/public.ts";
import { t } from "../src/shared/i18n/index.ts";
import { SiteFooter, SiteHeader } from "../src/shared/ui.tsx";

test("about page: intro, repository and contact links", () => {
  const html = renderToString(<AboutPage />);
  expect(html).toContain(t.about.greeting);
  expect(html).toContain(t.about.lead);
  expect(html).toContain(`<img src="/author.jpg" alt="${t.about.photoAlt}"`);
  expect(html).toContain('href="https://github.com/kss-t1/cultured-inn"');
  expect(html).toContain('href="mailto:krzysztof.spisak.spisacki@gmail.com"');
  expect(html).not.toContain("wa.me");
  expect(html).toContain('href="https://github.com/kss-t1"');
  for (const slug of ["larp", "impro", "rpg", "boardgames"]) expect(html).toContain(`badge--lg cat-${slug}`);
});

test("the header links to the submit page; the about page is linked from the footer", () => {
  const header = renderToString(<SiteHeader />);
  expect(header).toContain('href="/submit"');
  expect(header).toContain(`aria-label="${t.submit.headerLink}"`);
  expect(header).not.toContain('href="/about"');
  expect(header).not.toContain("aria-current");
  expect(renderToString(<SiteFooter note="" />)).toContain('href="/about"');
});

test("GET /about serves the page with its title and canonical link", async () => {
  const res = publicRoutes["/about"].GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain(`<title>${t.about.pageTitle}</title>`);
  expect(html).toContain('<link rel="canonical" href="https://karczma.test/about">');
  expect(html).toContain(t.about.greeting);
});
