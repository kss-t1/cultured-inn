export const CATEGORIES = ["LARP", "IMPRO", "RPG", "BOARDGAMES"] as const;
export type Category = (typeof CATEGORIES)[number];

/** URL slug, color and icon per category. Display labels live in i18n (t.categories). */
export const CATEGORY_INFO: Record<Category, { slug: string; color: string; icon: string }> = {
  LARP: { slug: "larp", color: "#8e44ad", icon: "⚔️" },
  IMPRO: { slug: "impro", color: "#d35400", icon: "🎭" },
  RPG: { slug: "rpg", color: "#c0392b", icon: "🐉" },
  BOARDGAMES: { slug: "boardgames", color: "#16897b", icon: "🎲" },
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
