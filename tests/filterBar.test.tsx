import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { FilterBar } from "../src/site/components/FilterBar.tsx";
import { DEFAULT_FILTERS } from "../src/shared/filters.ts";
import { t } from "../src/shared/i18n/index.ts";

const render = (collapsible: boolean, f = DEFAULT_FILTERS) =>
  renderToString(<FilterBar filters={f} onChange={() => {}} collapsible={collapsible} />);

test("on phones only 'Kiedy' and 'Co' show; dates and search wait behind 'Więcej filtrów'", () => {
  const html = render(true);
  expect(html).toContain(t.when.today);
  expect(html).toContain(t.categories.LARP);
  expect(html).toContain('aria-expanded="false" aria-controls="kk-more"');
  expect(html).not.toContain('type="date"');
  expect(html).not.toContain('id="kk-q"');
  expect(html).not.toContain("count-dot");
});

test("the collapsed toggle counts the hidden active filters: dates, search and extras", () => {
  const html = render(true, { ...DEFAULT_FILTERS, from: "2026-11-20", cats: ["LARP"], q: "smok", free: true });
  expect(html).toContain('<span class="count-dot">3</span>');
});

test("on desktop dates and search are always shown", () => {
  const html = render(false);
  expect(html).toContain('type="date"');
  expect(html).toContain('id="kk-q"');
});

test("a picked date gets a clear button (iOS's own Reset can't clear it)", () => {
  expect(render(false)).not.toContain(t.when.clear);
  expect(render(false, { ...DEFAULT_FILTERS, from: "2026-11-20" })).toContain(t.when.clear);
});
