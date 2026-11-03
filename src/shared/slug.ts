const EXTRA: Record<string, string> = { ł: "l", Ł: "l", ß: "ss", æ: "ae", ø: "o", đ: "d" };

/** "Sesja D&D: Zew Cthulhu w Gosu!" -> "sesja-d-d-zew-cthulhu-w-gosu" */
export function slugify(text: string, maxLen = 60): string {
  const base = text
    .replace(/[łŁßæøđ]/g, (c) => EXTRA[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, maxLen).replace(/-+$/, "") || "event";
}
