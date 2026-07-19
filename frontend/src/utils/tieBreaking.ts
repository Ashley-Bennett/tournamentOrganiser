/**
 * Pokemon Tournament Tie-Breaking Logic
 * Based on Play! Pokémon Tournament Rules Handbook Section 5.3
 * Reference: https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tournament-rules-handbook-en.pdf
 */

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
}

/**
 * Win percentage of a single competitor per handbook §5.3.3.1:
 * wins ÷ rounds played. Ties count as rounds but not as wins. Rounds in which
 * the competitor received a bye are excluded entirely (a bye counts as a win
 * for match points but is not included when calculating tiebreakers).
 * Minimum 25%; maximum 100%, or 75% if the competitor dropped from the event.
 */
export function calculateWinPercentage(
  record: { wins: number; matchesPlayed: number; byesReceived?: number },
  dropped: boolean,
): number {
  const byes = record.byesReceived ?? 0;
  const wins = Math.max(0, record.wins - byes);
  const rounds = Math.max(0, record.matchesPlayed - byes);
  if (rounds === 0) return 0.25;
  const cap = dropped ? 0.75 : 1;
  return Math.min(cap, Math.max(0.25, wins / rounds));
}

/**
 * Calculate Opponent's Match Win Percentage (OMW%)
 * Average of each opponent's win percentage (see calculateWinPercentage).
 */
export function calculateOpponentMatchWinPercentage(
  player: PlayerStanding,
  allStandings: Map<string, PlayerStanding>,
  droppedIds?: Set<string>,
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
      );
      totalOOMW += omw;
      validOpponents++;
    }
  }

  return validOpponents > 0 ? totalOOMW / validOpponents : 0;
}

/**
 * Add tie-breaker calculations to player standings
 */
export function addTieBreakers(
  standings: PlayerStanding[],
  droppedIds?: Set<string>,
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
      ),
      opponentOpponentMatchWinPercentage:
        calculateOpponentOpponentMatchWinPercentage(player, standingsMap, droppedIds),
      // Informational only — not a tiebreaker in the current handbook
      gameWinPercentage: totalGames > 0 ? gw / totalGames : 0,
    };
  });
}

/**
 * Sort players according to Pokemon tournament tie-breaking rules (§5.5.1.1):
 * 1. Dropped players always go to the bottom (regardless of score)
 * 2. Match Points (descending)
 * 3. Opponents' Win Percentage (descending)
 * 4. Opponents' Opponents' Win Percentage (descending)
 * 5. Head-to-Head — applied only when EXACTLY TWO players remain tied and
 *    they played each other during the tournament
 * 6. Name alphabetical (deterministic stand-in for the handbook's random order)
 */
export function sortByTieBreakers(
  standings: PlayerStanding[],
  droppedIds?: Set<string>,
): PlayerWithTieBreakers[] {
  const withTieBreakers = addTieBreakers(standings, droppedIds);
  const isDropped = (p: PlayerStanding) => droppedIds?.has(p.id) ?? false;

  const sorted = withTieBreakers.sort((a, b) => {
    // Dropped players always sort below active players
    if (isDropped(a) !== isDropped(b)) return isDropped(a) ? 1 : -1;

    // 1. Match Points (primary)
    if (b.matchPoints !== a.matchPoints) {
      return b.matchPoints - a.matchPoints;
    }

    // 2. Opponents' Win Percentage
    if (
      Math.abs(b.opponentMatchWinPercentage - a.opponentMatchWinPercentage) >
      0.0001
    ) {
      return b.opponentMatchWinPercentage - a.opponentMatchWinPercentage;
    }

    // 3. Opponents' Opponents' Win Percentage
    if (
      Math.abs(
        b.opponentOpponentMatchWinPercentage -
          a.opponentOpponentMatchWinPercentage,
      ) > 0.0001
    ) {
      return (
        b.opponentOpponentMatchWinPercentage -
        a.opponentOpponentMatchWinPercentage
      );
    }

    // 4. Alphabetical fallback for deterministic ordering; head-to-head is
    // resolved in a post-pass because it only applies to exactly-two ties
    return a.name.localeCompare(b.name);
  });

  // Head-to-head pass: for each run of players tied on all percentage
  // tiebreakers, if the run is exactly two players and they met during the
  // tournament, the winner of that match ranks higher.
  const tiedWith = (a: PlayerWithTieBreakers, b: PlayerWithTieBreakers) =>
    isDropped(a) === isDropped(b) &&
    a.matchPoints === b.matchPoints &&
    Math.abs(a.opponentMatchWinPercentage - b.opponentMatchWinPercentage) <=
      0.0001 &&
    Math.abs(
      a.opponentOpponentMatchWinPercentage -
        b.opponentOpponentMatchWinPercentage,
    ) <= 0.0001;

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
