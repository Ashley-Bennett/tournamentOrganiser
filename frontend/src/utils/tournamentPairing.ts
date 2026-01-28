/**
 * Pokemon Tournament Swiss Pairing Logic
 * Based on Play! Pokémon Tournament Rules Handbook
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
}

export interface Pairing {
  player1Id: string;
  player1Name: string;
  player2Id: string | null; // null if bye
  player2Name: string | null;
  roundNumber: number;
}

/**
 * Calculate match points for a player
 * Based on Play! Pokémon Tournament Rules:
 * - Win = 3 points
 * - Bye = 3 points (equivalent to a win)
 * - Draw/Tie = 1 point
 * - Loss = 0 points
 */
export function calculateMatchPoints(wins: number, draws: number): number {
  return wins * 3 + draws * 1;
}

/**
 * Group players by match points (score groups)
 */
export function groupByMatchPoints(
  standings: PlayerStanding[],
): Map<number, PlayerStanding[]> {
  const groups = new Map<number, PlayerStanding[]>();

  for (const player of standings) {
    const points = player.matchPoints;
    if (!groups.has(points)) {
      groups.set(points, []);
    }
    groups.get(points)!.push(player);
  }

  // Sort players within each group (for tie-breaking purposes)
  for (const [points, players] of groups.entries()) {
    players.sort((a, b) => {
      // Sort by opponent's match win percentage if available
      // This will be calculated separately
      return 0; // Placeholder - will be enhanced with tie-breakers
    });
  }

  return groups;
}

/**
 * Check if two players have already played each other
 */
export function havePlayedBefore(
  player1Id: string,
  player2Id: string,
  previousPairings: Pairing[],
): boolean {
  return previousPairings.some(
    (pairing) =>
      (pairing.player1Id === player1Id && pairing.player2Id === player2Id) ||
      (pairing.player1Id === player2Id && pairing.player2Id === player1Id),
  );
}

/**
 * Generate Swiss pairings for a round
 * Follows Pokemon tournament rules:
 * - First round: Random pairing
 * - Subsequent rounds: Pair within score groups, avoid rematches
 */
export function generateSwissPairings(
  standings: PlayerStanding[],
  roundNumber: number,
  previousPairings: Pairing[],
): Pairing[] {
  const pairings: Pairing[] = [];

  if (roundNumber === 1) {
    // First round: Random pairing
    const shuffled = [...standings].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        pairings.push({
          player1Id: shuffled[i].id,
          player1Name: shuffled[i].name,
          player2Id: shuffled[i + 1].id,
          player2Name: shuffled[i + 1].name,
          roundNumber,
        });
      } else {
        // Odd number of players - bye
        pairings.push({
          player1Id: shuffled[i].id,
          player1Name: shuffled[i].name,
          player2Id: null,
          player2Name: null,
          roundNumber,
        });
      }
    }
  } else {
    // Subsequent rounds: Pair within score groups
    const scoreGroups = groupByMatchPoints(standings);
    const sortedGroups = Array.from(scoreGroups.entries()).sort(
      (a, b) => b[0] - a[0],
    ); // Sort by points descending

    const unpaired: PlayerStanding[] = [];

    for (const [points, players] of sortedGroups) {
      const groupUnpaired: PlayerStanding[] = [];

      // Try to pair players within this score group
      for (let i = 0; i < players.length; i++) {
        const player1 = players[i];
        if (groupUnpaired.includes(player1)) continue;

        let paired = false;
        for (let j = i + 1; j < players.length; j++) {
          const player2 = players[j];
          if (
            groupUnpaired.includes(player2) ||
            havePlayedBefore(player1.id, player2.id, previousPairings)
          ) {
            continue;
          }

          // Found a valid pairing
          pairings.push({
            player1Id: player1.id,
            player1Name: player1.name,
            player2Id: player2.id,
            player2Name: player2.name,
            roundNumber,
          });
          groupUnpaired.push(player1, player2);
          paired = true;
          break;
        }

        if (!paired) {
          groupUnpaired.push(player1);
        }
      }

      // Add unpaired players from this group to the overall unpaired list
      for (const player of players) {
        if (!groupUnpaired.includes(player)) {
          unpaired.push(player);
        }
      }
    }

    // Pair unpaired players with next score group or assign bye
    // If odd number total, lowest-ranked player gets bye
    if (unpaired.length > 0) {
      // Sort unpaired by match points
      unpaired.sort((a, b) => b.matchPoints - a.matchPoints);

      for (let i = 0; i < unpaired.length; i += 2) {
        if (i + 1 < unpaired.length) {
          // Try to pair with someone they haven't played
          const player1 = unpaired[i];
          let paired = false;

          for (let j = i + 1; j < unpaired.length; j++) {
            const player2 = unpaired[j];
            if (!havePlayedBefore(player1.id, player2.id, previousPairings)) {
              pairings.push({
                player1Id: player1.id,
                player1Name: player1.name,
                player2Id: player2.id,
                player2Name: player2.name,
                roundNumber,
              });
              unpaired.splice(j, 1);
              paired = true;
              break;
            }
          }

          if (!paired && i + 1 < unpaired.length) {
            // Pair anyway if no rematch avoidance possible
            const player2 = unpaired[i + 1];
            pairings.push({
              player1Id: player1.id,
              player1Name: player1.name,
              player2Id: player2.id,
              player2Name: player2.name,
              roundNumber,
            });
            unpaired.splice(i + 1, 1);
          }
        } else {
          // Odd number - assign bye to lowest ranked
          pairings.push({
            player1Id: unpaired[i].id,
            player1Name: unpaired[i].name,
            player2Id: null,
            player2Name: null,
            roundNumber,
          });
        }
      }
    }
  }

  return pairings;
}
