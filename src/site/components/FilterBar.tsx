import type { CSSProperties } from "react";
import { CATEGORIES, CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { DEFAULT_FILTERS, WHENS, serializeFilters, type Filters, type When } from "../../shared/filters.ts";
import { localDateKey } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";

const PRICE_STEPS = [0, 10, 20, 30, 50, 75, 100, 150];

export function FilterBar({ filters: f, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });

  const pickWhen = (when: When) => set({ when, from: null, to: null });
  const today = localDateKey(new Date());
  // "Od" alone shows that single day; "Do" extends it to a range. Clearing "Od" goes back to the default window.
  const setFrom = (from: string) =>
    from ? set({ from, to: f.to && f.to > from ? f.to : null }) : pickWhen(DEFAULT_FILTERS.when);
  // Picking "Do" first starts the range today.
  const setTo = (to: string) => {
    const from = f.from ?? today;
    set({ from, to: to && to > from ? to : null });
  };
  const toggleCat = (c: Category) =>
    set({ cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c] });

  const isDirty = serializeFilters(f).toString() !== serializeFilters(DEFAULT_FILTERS).toString();
  const extraCount = [f.time, f.free, f.beginner, f.english, f.multiday, f.priceMax !== null].filter(Boolean).length;
  const priceIdx = f.priceMax === null ? PRICE_STEPS.length : Math.max(0, PRICE_STEPS.findIndex((p) => p >= f.priceMax!));

  return (
    <section className="filters" aria-label={t.filters.label}>
      <div className="chip-row" role="group" aria-label={t.filters.when}>
        {WHENS.map((w) => (
          <button key={w} type="button" className="chip" aria-pressed={!f.from && f.when === w} onClick={() => pickWhen(w)}>
            {t.when[w]}
          </button>
        ))}
        <span className="date-range">
          <label className={`chip date-chip${f.from ? " active" : ""}`}>
            <span>{t.when.from}</span>
            <input type="date" value={f.from ?? ""} min={today} aria-label={t.when.fromLabel}
              onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={`chip date-chip${f.to ? " active" : ""}`}>
            <span>{t.when.to}</span>
            <input type="date" value={f.to ?? ""} min={f.from ?? today} aria-label={t.when.toLabel}
              onChange={(e) => setTo(e.target.value)} />
          </label>
        </span>
      </div>

      <div className="chip-row" role="group" aria-label={t.filters.categories}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className="chip cat-chip"
            style={{ "--cat": CATEGORY_INFO[c].color } as CSSProperties}
            aria-pressed={f.cats.includes(c)}
            onClick={() => toggleCat(c)}
          >
            <span aria-hidden="true">{CATEGORY_INFO[c].icon}</span> {t.categories[c]}
          </button>
        ))}
      </div>

      <div className="search-row">
        <input
          type="search"
          className="search"
          placeholder={t.filters.searchPlaceholder}
          aria-label={t.filters.search}
          value={f.q}
          maxLength={100}
          onChange={(e) => set({ q: e.target.value })}
        />
        {isDirty && (
          <button type="button" className="link-btn" onClick={() => onChange(DEFAULT_FILTERS)}>
            {t.filters.clear}
          </button>
        )}
      </div>

      <details className="more" open={extraCount > 0 || undefined}>
        <summary>
          {t.filters.more}
          {extraCount > 0 && <span className="pill">{extraCount}</span>}
        </summary>
        <div className="chip-row">
          <button type="button" className="chip" aria-pressed={f.time === "evening"}
            onClick={() => set({ time: f.time === "evening" ? null : "evening" })}>
            {t.filters.evening}
          </button>
          <button type="button" className="chip" aria-pressed={f.time === "day"}
            onClick={() => set({ time: f.time === "day" ? null : "day" })}>
            {t.filters.daytime}
          </button>
          <button type="button" className="chip" aria-pressed={f.free} onClick={() => set({ free: !f.free })}>
            {t.filters.free}
          </button>
          <button type="button" className="chip" aria-pressed={f.beginner} onClick={() => set({ beginner: !f.beginner })}>
            {t.filters.beginner}
          </button>
          <button type="button" className="chip" aria-pressed={f.english} onClick={() => set({ english: !f.english })}>
            {t.filters.english}
          </button>
          <button type="button" className="chip" aria-pressed={f.multiday} onClick={() => set({ multiday: !f.multiday })}>
            {t.filters.multiday}
          </button>
        </div>
        <label className="price">
          <span>
            {t.filters.priceMax}:{" "}
            <output>{f.priceMax === null ? t.filters.priceAny : `${f.priceMax} ${t.event.currencyPLN}`}</output>
          </span>
          <input
            type="range"
            min={0}
            max={PRICE_STEPS.length}
            step={1}
            value={priceIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              set({ priceMax: i >= PRICE_STEPS.length ? null : PRICE_STEPS[i]! });
            }}
          />
        </label>
      </details>
    </section>
  );
}
