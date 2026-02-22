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
 * Calculate Opponent's Match Win Percentage (OMW%)
 * Formula: Sum of (opponent wins / opponent matches) / number of opponents
 */
export function calculateOpponentMatchWinPercentage(
  player: PlayerStanding,
  allStandings: Map<string, PlayerStanding>,
): number {
  if (player.opponents.length === 0) {
    return 0;
  }

  let totalOpponentWinPercentage = 0;
  let validOpponents = 0;

  for (const opponentId of player.opponents) {
    const opponent = allStandings.get(opponentId);
    if (opponent && opponent.matchesPlayed > 0) {
      const opponentWinPercentage = opponent.wins / opponent.matchesPlayed;
      totalOpponentWinPercentage += opponentWinPercentage;
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
): number {
  if (player.opponents.length === 0) {
    return 0;
  }

  let totalOOMW = 0;
  let validOpponents = 0;

  for (const opponentId of player.opponents) {
    const opponent = allStandings.get(opponentId);
    if (opponent) {
      const omw = calculateOpponentMatchWinPercentage(opponent, allStandings);
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
      ),
      opponentOpponentMatchWinPercentage:
        calculateOpponentOpponentMatchWinPercentage(player, standingsMap),
      gameWinPercentage: totalGames > 0 ? gw / totalGames : 0,
    };
  });
}

/**
 * Sort players according to Pokemon tournament tie-breaking rules:
 * 1. Match Points (descending)
 * 2. Opponent's Match Win Percentage (descending)
 * 3. Opponent's Opponent's Match Win Percentage (descending)
 * 4. Head-to-Head record (if the two players faced each other directly)
 * 5. Game Win Percentage (descending)
 * 6. Name alphabetical (stable deterministic fallback)
 */
export function sortByTieBreakers(
  standings: PlayerStanding[],
): PlayerWithTieBreakers[] {
  const withTieBreakers = addTieBreakers(standings);

  return withTieBreakers.sort((a, b) => {
    // 1. Match Points (primary)
    if (b.matchPoints !== a.matchPoints) {
      return b.matchPoints - a.matchPoints;
    }

    // 2. Opponent's Match Win Percentage
    if (
      Math.abs(b.opponentMatchWinPercentage - a.opponentMatchWinPercentage) >
      0.0001
    ) {
      return b.opponentMatchWinPercentage - a.opponentMatchWinPercentage;
    }

    // 3. Opponent's Opponent's Match Win Percentage
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

    // 4. Head-to-Head: if these two players faced each other, the winner ranks higher
    const aVsB = a.opponentResults?.[b.id];
    const bVsA = b.opponentResults?.[a.id];
    if (aVsB === "win" || bVsA === "loss") return -1;
    if (aVsB === "loss" || bVsA === "win") return 1;

    // 5. Game Win Percentage
    if (Math.abs(b.gameWinPercentage - a.gameWinPercentage) > 0.0001) {
      return b.gameWinPercentage - a.gameWinPercentage;
    }

    // 6. Alphabetical fallback for deterministic ordering
    return a.name.localeCompare(b.name);
  });
}
