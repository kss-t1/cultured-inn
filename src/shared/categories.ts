import type { IconName } from "./icons.ts";

export const CATEGORIES = ["LARP", "IMPRO", "RPG", "BOARDGAMES"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * URL slug, icon and colour per category. Display labels live in i18n (t.categories). The public
 * site styles categories with the .cat-<slug> classes in src/site/styles.css (light and dark);
 * `color` is the light-theme colour, for places without those classes (admin).
 */
export const CATEGORY_INFO: Record<Category, { slug: string; color: string; icon: IconName }> = {
  LARP: { slug: "larp", color: "#6a3fa8", icon: "larp" },
  IMPRO: { slug: "impro", color: "#a8480c", icon: "impro" },
  RPG: { slug: "rpg", color: "#9e1f33", icon: "rpg" },
  BOARDGAMES: { slug: "boardgames", color: "#0d6e63", icon: "boardgames" },
};

export function categoryFromSlug(slug: string): Category | null {
  const s = slug.toLowerCase();
  return CATEGORIES.find((c) => CATEGORY_INFO[c].slug === s) ?? null;
}

/**
 * Keyword rules for classifying imported events (DESIGN.md §5). The patterns are data, not
 * code: they must match Polish source text. Order matters: the first matching category wins.
 */
export const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["LARP", /\blarp|larpow/i],
  ["RPG", /\brpg\b|\bttrpg\b|d&d|\bdnd\b|dungeons (&|and) dragons|one-shot|gry? fabularn|warhammer fantasy roleplay|zew cthulhu|call of cthulhu|pathfinder|\bsesj[aię] rpg/i],
  ["IMPRO", /\bimpro\b|\bimpro[ -]|improwizacj|improwizowan|\bimprov\b|impro ?jam/i],
  ["BOARDGAMES", /planszów|planszow|board ?games?|gry? bitewn|wargam|gier karcianych|gry karciane|kooperacyjn/i],
];

export function classify(text: string): Category[] {
  return CATEGORY_KEYWORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
}
