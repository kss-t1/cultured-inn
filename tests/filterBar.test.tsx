import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FilterBar } from "../src/site/components/FilterBar.tsx";
import { DEFAULT_FILTERS } from "../src/shared/filters.ts";

const render = (collapsible: boolean, f = DEFAULT_FILTERS) =>
  renderToString(<FilterBar filters={f} onChange={() => {}} collapsible={collapsible} />);

test("on phones the filters start collapsed behind one toggle", () => {
  const html = render(true);
  expect(html).toContain('aria-expanded="false" aria-controls="kk-filters"');
  expect(html).not.toContain('id="kk-filters"');
  expect(html).not.toContain('id="kk-q"');
  expect(html).not.toContain("count-dot");
});

test("the collapsed toggle counts the active filters", () => {
  const html = render(true, { ...DEFAULT_FILTERS, cats: ["LARP", "RPG"], q: "smok", free: true });
  expect(html).toContain('<span class="count-dot">3</span>');
});

test("on desktop the filters are always shown, with no toggle", () => {
  const html = render(false);
  expect(html).toContain('id="kk-q"');
  expect(html).not.toContain('aria-controls="kk-filters"');
});
