import type { RulesProfile } from "./types";

/**
 * Rule sets available to tournaments.
 *
 * POKEMON_RULES reproduces exactly what the app did before multi-game support
 * existed, so extracting it is a refactor with no behavioural change: the
 * existing tieBreaking and tournamentPairing suites run against this profile.
 */

/**
 * Play! Pokémon Tournament Rules Handbook §5.3 / §5.5.1.1.
 * Reference: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf
 */
export const POKEMON_RULES: RulesProfile = {
  id: "pokemon",
  label: "Play! Pokémon",
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: ["omw", "oomw"],
  headToHead: true,
  winPct: { floor: 0.25, droppedCap: 0.75, excludeByes: true },
  scoring: "best_of_3",
  allowDraws: true,
};

/**
 * Rules-light Swiss for events that are not a specific TCG.
 *
 * Buchholz (sum of opponents' match points) rather than OMW%/OOMW%: it is the
 * ordinary Swiss tiebreak outside trading card games, it needs no handbook to
 * explain, and it carries none of the Pokémon-specific machinery — no 25%
 * floor, no 75% cap for drops, and byes counted plainly rather than excluded.
 *
 * Match points stay 3/1/0. Making those configurable touches every standings
 * surface, and nothing yet asks for it; the profile is where that would land.
 */
export const GENERIC_RULES: RulesProfile = {
  id: "generic",
  label: "Standard Swiss",
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: ["buchholz"],
  headToHead: true,
  winPct: { floor: 0, droppedCap: null, excludeByes: false },
  scoring: "match_only",
  allowDraws: true,
};
