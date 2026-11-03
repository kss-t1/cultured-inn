import { describe, expect, test } from "bun:test";
import { DEFAULT_FILTERS, isValidDate, parseFilters, serializeFilters } from "../src/shared/filters.ts";

const parse = (qs: string) => parseFilters(new URLSearchParams(qs));

describe("parseFilters", () => {
  test("empty query gives defaults (this month)", () => {
    expect(parse("")).toEqual(DEFAULT_FILTERS);
  });

  test("parses every supported param", () => {
    const f = parse("when=weekend&cat=rpg,larp&tags=d%26d,Horror&free=1&beginner=true&lang=en&multiday=1&time=evening&priceMax=30&bbox=16.8,52.3,17.1,52.5&q=%20gosu%20");
    expect(f).toEqual({
      when: "weekend", from: null, to: null,
      cats: ["LARP", "RPG"], // canonical order
      tags: ["d&d", "horror"],
      free: true, beginner: true, english: true, multiday: true,
      time: "evening", priceMax: 30, bbox: [16.8, 52.3, 17.1, 52.5], q: "gosu",
    });
  });

  test("drops invalid values instead of failing", () => {
    const f = parse("when=yesterday&cat=chess,impro,impro&time=night&priceMax=-5&bbox=1,2,3&from=2026-02-30&lang=de");
    expect(f.when).toBe("month");
    expect(f.cats).toEqual(["IMPRO"]);
    expect(f.time).toBeNull();
    expect(f.priceMax).toBeNull();
    expect(f.bbox).toBeNull();
    expect(f.from).toBeNull();
    expect(f.english).toBe(false);
  });

  test("when=month and today are accepted", () => {
    expect(parse("when=today").when).toBe("today");
    expect(parse("when=month").when).toBe("month");
    expect(serializeFilters(parse("when=today")).toString()).toBe("when=today");
  });

  test("date range: `to` before `from` is ignored", () => {
    expect(parse("from=2026-11-10&to=2026-11-01")).toMatchObject({ from: "2026-11-10", to: null });
    expect(parse("from=2026-11-10&to=2026-11-12")).toMatchObject({ from: "2026-11-10", to: "2026-11-12" });
  });

  test("bbox must be ordered min<max", () => {
    expect(parse("bbox=17,52,16,53").bbox).toBeNull();
  });

  test("legacy evening=1 maps to time=evening", () => {
    expect(parse("evening=1").time).toBe("evening");
  });

  test("category slugs are English", () => {
    expect(parse("cat=boardgames").cats).toEqual(["BOARDGAMES"]);
    expect(parse("cat=planszowki").cats).toEqual([]);
  });
});

describe("serializeFilters", () => {
  test("defaults serialize to an empty query", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
  });

  test("round-trips", () => {
    const qs = "when=week&cat=impro,boardgames&free=1&lang=en&time=day&priceMax=50&q=jam";
    const f = parse(qs);
    expect(parse(serializeFilters(f).toString())).toEqual(f);
  });

  test("from takes precedence over when", () => {
    const f = { ...DEFAULT_FILTERS, when: "weekend" as const, from: "2026-12-24", to: "2026-12-24" };
    expect(serializeFilters(f).toString()).toBe("from=2026-12-24");
  });
});

test("isValidDate", () => {
  expect(isValidDate("2028-02-29")).toBe(true);
  expect(isValidDate("2027-02-29")).toBe(false);
  expect(isValidDate("2026-1-01")).toBe(false);
});
