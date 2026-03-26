/**
 * Fetches the full Pokémon list (base + all forms) from PokéAPI and writes it
 * to frontend/public/pokemonList.json as a static asset.
 *
 * Skips regeneration if the file already exists and is less than 7 days old,
 * so local `npm run dev` restarts stay fast. Pass --force to override.
 *
 * Run via: node scripts/generatePokemonList.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'frontend', 'public', 'pokemonList.json');
const FORCE = process.argv.includes('--force');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Skip if fresh ──────────────────────────────────────────────────────────────

if (!FORCE && fs.existsSync(OUTPUT_PATH)) {
  const ageMs = Date.now() - fs.statSync(OUTPUT_PATH).mtimeMs;
  if (ageMs < MAX_AGE_MS) {
    const ageH = Math.round(ageMs / 3_600_000);
    console.log(`[pokemon] List is ${ageH}h old — skipping. Use --force to regenerate.`);
    process.exit(0);
  }
}

// ── Exclude list ───────────────────────────────────────────────────────────────
// Filter out cosmetic/duplicate variants that clutter the search without
// adding meaningful deck choices.

const EXCLUDE_EXACT = new Set([
  'eevee-starter',
  'pikachu-cosplay',
  'pikachu-original',
  'pikachu-hoenn',
  'pikachu-sinnoh',
  'pikachu-unova',
  'pikachu-kalos',
  'pikachu-alola',
  'pikachu-partner',
  'pikachu-starter',
  'pikachu-world',
  'pikachu-belle',
  'pikachu-phd',
  'pikachu-pop-star',
  'pikachu-rock-star',
  'pikachu-libre',
  'basculin-blue-striped',  // keep red-striped as base
]);

const EXCLUDE_PREFIX = [
  'unown-',        // letter variants (keep base unown)
  'furfrou-',      // trim forms (keep base furfrou)
  'vivillon-',     // wing patterns (keep base vivillon)
  'alcremie-',     // decoration variants (keep base alcremie)
  'minior-',       // colour variants (keep base minior)
  'spewpa-',
];

const EXCLUDE_SUFFIX = [
  '-spring', '-summer', '-autumn', '-winter',  // Deerling/Sawsbuck seasons
  '-totem',    // Totem Pokémon (SM)
  '-mega-z',   // Z-Move Mega forms (not real playable forms)
];

function shouldExclude(name) {
  if (EXCLUDE_EXACT.has(name)) return true;
  if (EXCLUDE_PREFIX.some((p) => name.startsWith(p))) return true;
  if (EXCLUDE_SUFFIX.some((s) => name.endsWith(s))) return true;
  return false;
}

// ── Display name formatter ─────────────────────────────────────────────────────
// Converts PokéAPI slugs to readable names. Examples:
//   absol-mega           → Mega Absol
//   charizard-mega-x     → Mega Charizard X
//   growlithe-hisui      → Hisuian Growlithe
//   darmanitan-galar-zen → Galarian Darmanitan Zen
//   kyogre-primal        → Primal Kyogre
//   charizard-gmax       → Charizard (Gigantamax)
//   urshifu-rapid-strike → Urshifu Rapid Strike

const REGION_LABELS = {
  hisui: 'Hisuian',
  alola: 'Alolan',
  galar: 'Galarian',
  paldea: 'Paldean',
};

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDisplayName(apiName) {
  const parts = apiName.split('-');

  // Mega (with optional X/Y variant): absol-mega, charizard-mega-x
  const megaIdx = parts.indexOf('mega');
  if (megaIdx !== -1) {
    const baseParts = parts.filter((_, i) => i !== megaIdx);
    // Check if next part after mega is x or y
    const variantIdx = megaIdx + 1;
    let variant = '';
    let filteredBase = baseParts;
    if (parts[variantIdx] === 'x' || parts[variantIdx] === 'y') {
      variant = ` ${parts[variantIdx].toUpperCase()}`;
      filteredBase = baseParts.filter((p) => p !== parts[variantIdx]);
    }
    return `Mega ${filteredBase.map(cap).join(' ')}${variant}`;
  }

  // Primal: kyogre-primal, groudon-primal
  if (parts.at(-1) === 'primal') {
    return `Primal ${parts.slice(0, -1).map(cap).join(' ')}`;
  }

  // Regional forms: find the region key anywhere in parts
  for (const [key, label] of Object.entries(REGION_LABELS)) {
    const idx = parts.indexOf(key);
    if (idx !== -1) {
      const remaining = parts.filter((_, i) => i !== idx).map(cap).join(' ');
      return `${label} ${remaining}`;
    }
  }

  // Gigantamax: charizard-gmax
  if (parts.at(-1) === 'gmax') {
    return `${parts.slice(0, -1).map(cap).join(' ')} (Gigantamax)`;
  }

  // Default: capitalise each word
  return parts.map(cap).join(' ');
}

// ── Fetch & generate ───────────────────────────────────────────────────────────

console.log('[pokemon] Fetching full Pokémon list from PokéAPI...');

let res;
try {
  res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=10000');
} catch (err) {
  console.error('[pokemon] Network error:', err.message);
  if (fs.existsSync(OUTPUT_PATH)) {
    console.warn('[pokemon] Using existing (possibly stale) list.');
    process.exit(0);
  }
  process.exit(1);
}

if (!res.ok) {
  console.error(`[pokemon] HTTP ${res.status} from PokéAPI`);
  if (fs.existsSync(OUTPUT_PATH)) {
    console.warn('[pokemon] Using existing (possibly stale) list.');
    process.exit(0);
  }
  process.exit(1);
}

const data = await res.json();

const pokemon = [];
for (const entry of data.results) {
  const name = entry.name;
  if (shouldExclude(name)) continue;

  // Extract numeric ID from URL: "https://pokeapi.co/api/v2/pokemon/1/"
  const id = parseInt(entry.url.split('/').filter(Boolean).at(-1), 10);
  if (!id || isNaN(id)) continue;

  pokemon.push({
    id,
    name,
    displayName: formatDisplayName(name),
  });
}

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pokemon, null, 0));

console.log(`[pokemon] Written ${pokemon.length} entries to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
