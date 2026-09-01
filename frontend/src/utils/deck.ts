// Identity and labelling for a deck, which is a pair of Pokémon ids either of
// which may be null. Shared by the stats pages so the same deck produces the
// same key and the same label everywhere it appears.

export interface DeckRef {
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

/** Stable key for a deck. "x" stands in for an empty slot so 1-null and null-1 differ. */
export function deckKey(d: DeckRef): string {
  return `${d.deck_pokemon1 ?? "x"}-${d.deck_pokemon2 ?? "x"}`;
}

/** Human label, e.g. "Gardevoir / Snorlax". Falls back to #id for unknown ids. */
export function deckName(d: DeckRef, nameMap: Map<number, string>): string {
  const parts = [d.deck_pokemon1, d.deck_pokemon2]
    .filter((id): id is number => id != null)
    .map((id) => nameMap.get(id) ?? `#${id}`);
  return parts.length > 0 ? parts.join(" / ") : "Unknown deck";
}
