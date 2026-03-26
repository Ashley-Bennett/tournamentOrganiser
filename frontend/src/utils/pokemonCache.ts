// Pokemon list — loaded once from the static /pokemonList.json asset generated
// at build time by scripts/generatePokemonList.mjs.
// Sprite URLs are constructed directly from the pokemon ID (no API calls).

export interface PokemonEntry {
  id: number;
  name: string;        // e.g. "absol-mega"
  displayName: string; // e.g. "Mega Absol"
}

export function getSpriteUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

export function getArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

// In-memory cache — populated once per session, then reused instantly.
let cachedList: PokemonEntry[] | null = null;
let fetchPromise: Promise<PokemonEntry[]> | null = null;

export async function getPokemonList(): Promise<PokemonEntry[]> {
  if (cachedList) return cachedList;

  // Deduplicate concurrent calls — only one fetch in flight at a time.
  if (!fetchPromise) {
    fetchPromise = fetch('/pokemonList.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PokemonEntry[]>;
      })
      .then((list) => {
        cachedList = list;
        fetchPromise = null;
        return list;
      })
      .catch((err) => {
        fetchPromise = null;
        throw err;
      });
  }

  return fetchPromise;
}
