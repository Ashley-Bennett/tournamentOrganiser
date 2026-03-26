// Pokemon list cache — fetches the full list from PokéAPI once and stores it
// in localStorage with a 7-day TTL. Sprite URLs are constructed directly from
// the pokemon ID without any additional API calls.

export interface PokemonEntry {
  id: number;
  name: string;        // e.g. "bulbasaur"
  displayName: string; // e.g. "Bulbasaur"
}

const CACHE_KEY = "pokemon_list_cache";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheRecord {
  fetchedAt: number;
  pokemon: PokemonEntry[];
}

export function getSpriteUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

export function getArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function readCache(): CacheRecord | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CacheRecord;
  } catch {
    // ignore parse errors
  }
  return null;
}

function writeCache(pokemon: PokemonEntry[]) {
  try {
    const record: CacheRecord = { fetchedAt: Date.now(), pokemon };
    localStorage.setItem(CACHE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage errors (quota, private browsing, etc.)
  }
}

export async function getPokemonList(): Promise<PokemonEntry[]> {
  // Return cached data if still fresh
  const cached = readCache();
  if (cached && cached.fetchedAt + TTL_MS > Date.now()) {
    return cached.pokemon;
  }

  try {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1025");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      results: { name: string; url: string }[];
    };

    const pokemon: PokemonEntry[] = data.results.map((entry) => {
      // Extract numeric ID from URL like "https://pokeapi.co/api/v2/pokemon/1/"
      const id = parseInt(
        entry.url.split("/").filter(Boolean).pop() ?? "0",
        10,
      );
      const displayName =
        entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
      return { id, name: entry.name, displayName };
    });

    writeCache(pokemon);
    return pokemon;
  } catch {
    // On fetch failure, return stale cache rather than throwing
    if (cached) return cached.pokemon;
    throw new Error("Failed to load Pokémon list");
  }
}
