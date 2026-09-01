/**
 * Tie-breaking library.
 *
 * This module implements the tiebreakers themselves; a RulesProfile decides
 * which of them apply and how a competitor's win percentage is bounded. The
 * Pokémon chain (OMW% → OOMW% → head-to-head) is unchanged from before
 * multi-game support and remains the default for every existing caller.
 *
 * Pokémon rules follow the Play! Pokémon Tournament Rules Handbook §5.3.
 * Reference: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf
 */

import { POKEMON_RULES } from "../games/rules";
import type { RulesProfile, TiebreakerId } from "../games/types";

export interface PlayerStanding {
  id: string;
  name: string;
  matchPoints: number; // 3 for win, 1 for draw, 0 for loss
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  opponents: string[]; // Array of opponent player IDs
  byesReceived?: number; // For bye priority (lowest score, fewest byes)
  // Optional fields for extended tie-breaking
  opponentResults?: Record<string, "win" | "loss" | "draw">; // Head-to-head results keyed by opponent ID
  gameWins?: number; // Individual game wins (across all matches)
  gameLosses?: number; // Individual game losses (across all matches)
}

export interface PlayerWithTieBreakers extends PlayerStanding {
  opponentMatchWinPercentage: number; // OMW%
  opponentOpponentMatchWinPercentage: number; // OOMW%
  gameWinPercentage: number; // GW%
  buchholz: number; // Sum of opponents' match points
}

/** Bounds on a competitor's win %, taken from the active rules profile. */
type WinPctBounds = RulesProfile["winPct"];

/**
 * Win percentage of a single competitor.
 *
 * Under Play! Pokémon §5.3.3.1 this is wins ÷ rounds played: ties count as
 * rounds but not as wins, rounds won by bye are excluded entirely, the result
 * is floored at 25% and capped at 75% for a competitor who dropped.
 *
 * Each of those adjustments is a profile setting, so a rule set without them
 * (generic Swiss) gets the plain ratio.
 */
export function calculateWinPercentage(
  record: { wins: number; matchesPlayed: number; byesReceived?: number },
  dropped: boolean,
  bounds: WinPctBounds = POKEMON_RULES.winPct,
): number {
  const byes = bounds.excludeByes ? (record.byesReceived ?? 0) : 0;
  const wins = Math.max(0, record.wins - byes);
  const rounds = Math.max(0, record.matchesPlayed - byes);
  if (rounds === 0) return bounds.floor;
  const cap = dropped && bounds.droppedCap !== null ? bounds.droppedCap : 1;
  return Math.min(cap, Math.max(bounds.floor, wins / rounds));
}

/**
 * Calculate Opponent's Match Win Percentage (OMW%)
 * Average of each opponent's win percentage (see calculateWinPercentage).
 */
export function calculateOpponentMatchWinPercentage(
  player: PlayerStanding,
  allStandings: Map<string, PlayerStanding>,
  droppedIds?: Set<string>,
  bounds: WinPctBounds = POKEMON_RULES.winPct,
): number {
  if (player.opponents.length === 0) {
    return 0;
  }

  let totalOpponentWinPercentage = 0;
  let validOpponents = 0;

  for (const opponentId of player.opponents) {
    const opponent = allStandings.get(opponentId);
    if (opponent && opponent.matchesPlayed > 0) {
      totalOpponentWinPercentage += calculateWinPercentage(
        opponent,
        droppedIds?.has(opponentId) ?? false,
        bounds,
      );
      validOpponents++;
    }
  }

  return validOpponents > 0 ? totalOpponentWinPercentage / validOpponents : 0;
}

/**
 * Calculate Opponent's Opponent's Match Win Percentage (OOMW%)
 * Average win percentage of opponents' opponents
 */
export function calculateOpponentOpponentMatchWinPercentage(
  player: PlayerStanding,
  allStandings: Map<string, PlayerStanding>,
  droppedIds?: Set<string>,
  bounds: WinPctBounds = POKEMON_RULES.winPct,
): number {
  if (player.opponents.length === 0) {
    return 0;
  }

  let totalOOMW = 0;
  let validOpponents = 0;

  for (const opponentId of player.opponents) {
    const opponent = allStandings.get(opponentId);
    if (opponent) {
      const omw = calculateOpponentMatchWinPercentage(
        opponent,
        allStandings,
        droppedIds,
        bounds,
      );
      totalOOMW += omw;
      validOpponents++;
    }
  }

  return validOpponents > 0 ? totalOOMW / validOpponents : 0;
}

/**
 * Buchholz — the sum of every opponent's match points.
 *
 * The ordinary Swiss tiebreak outside trading card games: it rewards having
 * faced a harder field, needs no win-percentage floors or caps, and is a whole
 * number an organiser can check by hand. Opponents missing from the standings
 * (deleted entries) contribute nothing.
 */
export function calculateBuchholz(
  player: PlayerStanding,
  allStandings: Map<string, PlayerStanding>,
): number {
  let total = 0;
  for (const opponentId of player.opponents) {
    total += allStandings.get(opponentId)?.matchPoints ?? 0;
  }
  return total;
}

/**
 * Add tie-breaker calculations to player standings.
 *
 * Every tiebreaker is computed regardless of which the profile ranks by — they
 * are cheap at tournament sizes, and standings tables show OMW% or Buchholz as
 * columns whether or not the sort had to reach them.
 */
export function addTieBreakers(
  standings: PlayerStanding[],
  droppedIds?: Set<string>,
  rules: RulesProfile = POKEMON_RULES,
): PlayerWithTieBreakers[] {
  const standingsMap = new Map<string, PlayerStanding>();
  for (const standing of standings) {
    standingsMap.set(standing.id, standing);
  }

  return standings.map((player) => {
    const gw = player.gameWins ?? 0;
    const gl = player.gameLosses ?? 0;
    const totalGames = gw + gl;
    return {
      ...player,
      opponentMatchWinPercentage: calculateOpponentMatchWinPercentage(
        player,
        standingsMap,
        droppedIds,
        rules.winPct,
      ),
      opponentOpponentMatchWinPercentage:
        calculateOpponentOpponentMatchWinPercentage(
          player,
          standingsMap,
          droppedIds,
          rules.winPct,
        ),
      buchholz: calculateBuchholz(player, standingsMap),
      // Informational only — not a tiebreaker in the current handbook
      gameWinPercentage: totalGames > 0 ? gw / totalGames : 0,
    };
  });
}

/** How each numeric tiebreaker reads off an enriched standing. */
const TIEBREAK_VALUE: Record<
  TiebreakerId,
  (p: PlayerWithTieBreakers) => number
> = {
  omw: (p) => p.opponentMatchWinPercentage,
  oomw: (p) => p.opponentOpponentMatchWinPercentage,
  buchholz: (p) => p.buchholz,
};

const EPSILON = 0.0001;

/**
 * Rank standings under a rules profile:
 * 1. Dropped players always go to the bottom (regardless of score)
 * 2. Match Points (descending)
 * 3. Each of the profile's numeric tiebreakers, in order (descending)
 * 4. Head-to-Head, where the profile uses it — applied only when EXACTLY TWO
 *    players remain tied and they played each other during the tournament
 * 5. Name alphabetical (deterministic stand-in for a random draw)
 */
export function sortByProfile(
  standings: PlayerStanding[],
  rules: RulesProfile,
  droppedIds?: Set<string>,
): PlayerWithTieBreakers[] {
  const withTieBreakers = addTieBreakers(standings, droppedIds, rules);
  const isDropped = (p: PlayerStanding) => droppedIds?.has(p.id) ?? false;
  const readers = rules.tiebreakers.map((id) => TIEBREAK_VALUE[id]);

  const sorted = withTieBreakers.sort((a, b) => {
    // Dropped players always sort below active players
    if (isDropped(a) !== isDropped(b)) return isDropped(a) ? 1 : -1;

    // 1. Match Points (primary)
    if (b.matchPoints !== a.matchPoints) {
      return b.matchPoints - a.matchPoints;
    }

    // 2. Profile tiebreakers, in order
    for (const read of readers) {
      const diff = read(b) - read(a);
      if (Math.abs(diff) > EPSILON) return diff;
    }

    // 3. Alphabetical fallback for deterministic ordering; head-to-head is
    // resolved in a post-pass because it only applies to exactly-two ties
    return a.name.localeCompare(b.name);
  });

  if (!rules.headToHead) return sorted;

  // Head-to-head pass: for each run of players tied on match points and every
  // numeric tiebreaker the profile uses, if the run is exactly two players and
  // they met during the tournament, the winner of that match ranks higher.
  const tiedWith = (a: PlayerWithTieBreakers, b: PlayerWithTieBreakers) =>
    isDropped(a) === isDropped(b) &&
    a.matchPoints === b.matchPoints &&
    readers.every((read) => Math.abs(read(a) - read(b)) <= EPSILON);

  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && tiedWith(sorted[i]!, sorted[j]!)) j++;
    if (j - i === 2) {
      const x = sorted[i]!;
      const y = sorted[i + 1]!;
      const xVsY = x.opponentResults?.[y.id];
      const yVsX = y.opponentResults?.[x.id];
      if (xVsY === "loss" || yVsX === "win") {
        sorted[i] = y;
        sorted[i + 1] = x;
      }
    }
    i = j;
  }

  return sorted;
}

/**
 * Rank standings under Play! Pokémon rules (§5.5.1.1).
 * The default entry point for every existing standings surface.
 */
export function sortByTieBreakers(
  standings: PlayerStanding[],
  droppedIds?: Set<string>,
): PlayerWithTieBreakers[] {
  return sortByProfile(standings, POKEMON_RULES, droppedIds);
}
