/**
 * Tournament display and setup helpers.
 */

export function getTournamentTypeLabel(type: string): string {
  if (!type) return "";
  return type === "single_elimination" ? "Single Elimination" : "Swiss";
}

/**
 * Suggested number of rounds based on player count and tournament type.
 */
export function calculateSuggestedRounds(
  playerCount: number,
  tournamentType: string,
): number {
  if (playerCount < 2) return 0;

  if (tournamentType === "single_elimination") {
    return Math.ceil(Math.log2(playerCount));
  }

  // Swiss: standard bracket thresholds (Pokémon/MTG tournament rules)
  if (playerCount <= 8) return 3;
  if (playerCount <= 16) return 4;
  if (playerCount <= 32) return 5;
  if (playerCount <= 64) return 6;
  if (playerCount <= 128) return 7;
  if (playerCount <= 226) return 8;
  return 9;
}
