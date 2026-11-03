import { useState } from "react";
import { CATEGORIES, CATEGORY_INFO, type Category } from "../../shared/categories.ts";
import { DEFAULT_FILTERS, WHENS, serializeFilters, type Filters, type When } from "../../shared/filters.ts";
import { localDateKey } from "../../shared/format.ts";
import { t } from "../../shared/i18n/index.ts";
import { Icon } from "../../shared/ui.tsx";

/** The price slider's top step means "any price". */
const PRICE_ANY = 150;

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
  const [moreOpen, setMoreOpen] = useState(extraCount > 0);
  const price = f.priceMax === null ? PRICE_ANY : Math.min(f.priceMax, PRICE_ANY);
  const priceLabel = f.priceMax === null ? t.filters.priceAny : `${f.priceMax} ${t.event.currencyPLN}`;
  const [scaleMin, scaleMax] = t.filters.priceScale(PRICE_ANY);

  const flags: { label: string; on: boolean; toggle: () => void }[] = [
    { label: t.filters.evening, on: f.time === "evening", toggle: () => set({ time: f.time === "evening" ? null : "evening" }) },
    { label: t.filters.daytime, on: f.time === "day", toggle: () => set({ time: f.time === "day" ? null : "day" }) },
    { label: t.filters.free, on: f.free, toggle: () => set({ free: !f.free }) },
    { label: t.filters.beginner, on: f.beginner, toggle: () => set({ beginner: !f.beginner }) },
    { label: t.filters.english, on: f.english, toggle: () => set({ english: !f.english }) },
    { label: t.filters.multiday, on: f.multiday, toggle: () => set({ multiday: !f.multiday }) },
  ];

  return (
    <section className="filters" aria-label={t.filters.label}>
      <div className="fgroup">
        <span className="eyebrow" id="lbl-when">{t.filters.when}</span>
        <div className="fgroup__row">
          <div className="scroller" role="group" aria-labelledby="lbl-when">
            {WHENS.map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={!f.from && f.when === w} onClick={() => pickWhen(w)}>
                <Icon name="check" size="sm" className="chip__check" />{t.when[w]}
              </button>
            ))}
          </div>
          <div className="dates">
            <label className="field">
              <span className="field__label">{t.when.from}</span>
              <input className="input" type="date" value={f.from ?? ""} min={today} aria-label={t.when.fromLabel}
                onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">{t.when.to}</span>
              <input className="input" type="date" value={f.to ?? ""} min={f.from ?? today} aria-label={t.when.toLabel}
                onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="fgroup">
        <span className="eyebrow" id="lbl-what">{t.filters.categories}</span>
        <div className="scroller" role="group" aria-labelledby="lbl-what">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip chip--cat cat-${CATEGORY_INFO[c].slug}`}
              aria-pressed={f.cats.includes(c)} onClick={() => toggleCat(c)}>
              <Icon name={CATEGORY_INFO[c].icon} />{t.categories[c]}<Icon name="check" size="sm" className="chip__check" />
            </button>
          ))}
        </div>
      </div>

      <div className="fgroup">
        <label className="eyebrow" htmlFor="kk-q">{t.filters.search}</label>
        <div className="searchrow">
          <span className="input-icon">
            <Icon name="search" />
            <input id="kk-q" className="input" type="search" placeholder={t.filters.searchPlaceholder}
              value={f.q} maxLength={100} onChange={(e) => set({ q: e.target.value })} />
          </span>
          <div className="searchrow__actions">
            <button type="button" className="btn btn--secondary" aria-expanded={moreOpen} aria-controls="kk-more"
              onClick={() => setMoreOpen(!moreOpen)}>
              <Icon name="sliders" />{t.filters.more}
              {extraCount > 0 && <span className="count-dot">{extraCount}</span>}
              <Icon name="chev" size="sm" className="chev" />
            </button>
            {isDirty && <button type="button" className="linkbtn" onClick={() => onChange(DEFAULT_FILTERS)}>{t.filters.clear}</button>}
          </div>
        </div>
      </div>

      {moreOpen && (
        <div className="more" id="kk-more">
          <div className="more__toggles" role="group" aria-label={t.filters.moreLabel}>
            {flags.map((x) => (
              <button key={x.label} type="button" className="chip chip--opt" aria-pressed={x.on} onClick={x.toggle}>
                <Icon name="check" size="sm" className="chip__check" />{x.label}
              </button>
            ))}
          </div>
          <div className="range">
            <div className="range__head">
              <label htmlFor="kk-price">{t.filters.priceMax}</label>
              <span className="range__val">{priceLabel}</span>
            </div>
            <input id="kk-price" className="slider" type="range" min={0} max={PRICE_ANY} step={5} value={price}
              aria-valuetext={priceLabel}
              onChange={(e) => {
                const v = Number(e.target.value);
                set({ priceMax: v >= PRICE_ANY ? null : v });
              }} />
            <div className="range__scale"><span>{scaleMin}</span><span>{scaleMax}</span></div>
          </div>
        </div>
      )}
    </section>
  );
}
