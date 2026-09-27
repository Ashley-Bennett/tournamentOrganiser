/**
 * Free-text search shared by every list that can be typed into.
 *
 * Each word of the query has to appear somewhere in the fields, in any order,
 * so "mega chandelure", "chandelure mega" and "chandelure-mega" all find the
 * same Pokémon. Hyphens, underscores and accents are folded away first, which
 * is what lets a typed "pokemon" or "ho oh" match "Pokémon" and "ho-oh".
 */

export function normaliseSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const words = normaliseSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normaliseSearchText(fields.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}
