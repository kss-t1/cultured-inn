import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { AboutPage } from "../src/routes/AboutPage.tsx";
import { t } from "../src/shared/i18n/index.ts";
import { SiteHeader } from "../src/shared/ui.tsx";

test("about page: intro, repository and contact links", () => {
  const html = renderToString(<AboutPage />);
  expect(html).toContain(t.about.hello);
  expect(html).toContain('href="https://github.com/kss-t1/cultured-inn"');
  expect(html).toContain('href="mailto:krzysztof.spisak.spisacki@gmail.com"');
  expect(html).toContain('href="https://wa.me/48739272287"');
  expect(html).toContain('href="https://github.com/kss-t1"');
  expect(html).toMatch(/href="\/about" aria-current="page"/);
});

test("the header links to the about and submit pages on every page", () => {
  const html = renderToString(<SiteHeader />);
  expect(html).toContain('href="/about"');
  expect(html).toContain('href="/submit"');
  expect(html).not.toContain("aria-current");
});
