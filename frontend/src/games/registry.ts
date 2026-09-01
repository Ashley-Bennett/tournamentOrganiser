import { GENERIC_RULES, POKEMON_RULES } from "./rules";
import type { GameDefinition, TournamentStructure } from "./types";

/**
 * The games registry — the single place a new game is added.
 *
 * Adding a game should mean adding an entry here (plus a deck module if it
 * needs one). Nothing outside this directory should branch on a game id.
 */

const POKEMON: GameDefinition = {
  id: "pokemon",
  name: "Pokémon TCG",
  shortName: "Pokémon",
  status: "available",
  formats: [
    { id: "standard", name: "Standard", hint: "Current rotation" },
    { id: "expanded", name: "Expanded", hint: "Black & White onwards" },
    { id: "glc", name: "Gym Leader Challenge", hint: "Singleton, one type" },
  ],
  structures: ["swiss", "round_robin"],
  deck: "pokemon",
  rules: POKEMON_RULES,
  iconSrc: "/games/pokemon.svg",
  accent: "#F2C94C",
  defaults: { structure: "swiss", format: "standard" },
};

const GENERIC: GameDefinition = {
  id: "generic",
  name: "Generic tournament",
  shortName: "Generic",
  status: "available",
  // No formats: a generic event is not a specific game, so there is nothing
  // to pick between. The create dialog skips the format step entirely.
  formats: [],
  structures: ["swiss", "round_robin"],
  deck: "none",
  rules: GENERIC_RULES,
  iconSrc: "/games/generic.svg",
  // Mid-tone on purpose: a darker slate vanishes against the dark theme and
  // a lighter one washes out on white.
  accent: "#8296B0",
  defaults: { structure: "swiss" },
};

/**
 * Announced but not implemented. These appear disabled in the picker so the
 * roadmap is visible; their rules are a placeholder and are never used while
 * status is `coming_soon`.
 */
function comingSoon(
  id: string,
  name: string,
  shortName: string,
  accent: string,
): GameDefinition {
  return {
    id,
    name,
    shortName,
    status: "coming_soon",
    formats: [],
    structures: ["swiss"],
    deck: "none",
    rules: GENERIC_RULES,
    iconSrc: `/games/${id}.svg`,
    accent,
    defaults: { structure: "swiss" },
  };
}

export const GAMES: GameDefinition[] = [
  POKEMON,
  GENERIC,
  comingSoon("magic", "Magic: The Gathering", "Magic", "#C4692F"),
  comingSoon("yugioh", "Yu-Gi-Oh!", "Yu-Gi-Oh!", "#8B5CF6"),
  comingSoon("lorcana", "Disney Lorcana", "Lorcana", "#2F9EC4"),
  comingSoon("onepiece", "One Piece Card Game", "One Piece", "#D6455B"),
];

/** Games an organiser can actually create a tournament for. */
export const AVAILABLE_GAMES = GAMES.filter((g) => g.status === "available");

export const DEFAULT_GAME_ID = "generic";

/**
 * Structures the app can actually run today.
 *
 * A game may declare `round_robin` in its registry entry before the pairing
 * code for it exists; until then the create dialog offers it disabled rather
 * than creating a tournament that would silently be paired as Swiss.
 */
export const IMPLEMENTED_STRUCTURES: TournamentStructure[] = ["swiss"];

export function isStructureImplemented(structure: TournamentStructure): boolean {
  return IMPLEMENTED_STRUCTURES.includes(structure);
}

/**
 * Look up a game, falling back to Generic for an id this build does not know.
 * Rows outlive registry entries — a tournament created against a game that is
 * later renamed or withdrawn must still open rather than crash the page.
 */
export function getGame(gameId: string | null | undefined): GameDefinition {
  return (
    GAMES.find((g) => g.id === gameId) ??
    GAMES.find((g) => g.id === DEFAULT_GAME_ID)!
  );
}

export function getGameFormat(gameId: string | null | undefined, formatId: string | null | undefined) {
  if (!formatId) return null;
  return getGame(gameId).formats.find((f) => f.id === formatId) ?? null;
}

/**
 * Label for a format code, falling back to the stored text itself. Formats
 * were free text before multi-game support, so older tournaments hold values
 * the registry has never heard of and those must still display.
 */
export function formatLabel(
  gameId: string | null | undefined,
  formatId: string | null | undefined,
): string | null {
  if (!formatId) return null;
  return getGameFormat(gameId, formatId)?.name ?? formatId;
}

export function structureLabel(structure: TournamentStructure | string): string {
  switch (structure) {
    case "round_robin":
      return "Round Robin";
    case "single_elimination":
      return "Single Elimination";
    default:
      return "Swiss";
  }
}

/** The rules a tournament of this game is scored under. */
export function rulesFor(gameId: string | null | undefined) {
  return getGame(gameId).rules;
}
