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
 * Keyword rules for classifying imported events (DESIGN.md §5), used from M2.
 * The patterns are data, not code: they must match Polish source text.
 */
export const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["LARP", /\blarp|larpow/i],
  ["IMPRO", /\bimpro|improwiz/i],
  ["RPG", /\brpg\b|\bsesj[aię]|d&d|\bdnd\b|one-shot|warhammer fantasy roleplay|zew cthulhu/i],
  ["BOARDGAMES", /planszów|planszow|board ?games?|gry planszowe/i],
];

export function classify(text: string): Category[] {
  return CATEGORY_KEYWORDS.filter(([, re]) => re.test(text)).map(([c]) => c);
}
