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
  byesReceived: number; // For bye priority: give bye to fewest previous byes (among lowest score)
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
 * Compare for bye priority: bye goes to lowest score, then fewest previous byes, then id.
 */
function byePriority(a: PlayerStanding, b: PlayerStanding): number {
  if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
}

/**
 * Sort order for pairing within a group: high-to-low (best vs worst, 2nd best vs 2nd worst).
 * For floating DOWN: "lowest" in group = most byes received, then id (deterministic).
 */
function pairingOrder(a: PlayerStanding, b: PlayerStanding): number {
  // For high-to-low pairing: sort by byesReceived ASC (fewest byes = "best"), then id
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
}

/**
 * "Lowest" in group for floating DOWN: most byes received, then id (deterministic).
 */
function floatOrder(a: PlayerStanding, b: PlayerStanding): number {
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return bByes - aByes;
  return a.id.localeCompare(b.id);
}

/**
 * Deterministic overall ordering for Swiss pairing:
 * - Higher match points first
 * - Then fewer byes received (stabilizes "strength" a bit)
 * - Then id
 */
function swissOrder(a: PlayerStanding, b: PlayerStanding): number {
  if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
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

  for (const players of groups.values()) {
    players.sort(pairingOrder); // Sort for high-to-low pairing within group
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
 * Generate Swiss pairings in a strict top-down manner.
 *
 * Key behavior (matches user expectations):
 * - Work from the highest score downward (best-ranked unpaired player picks first)
 * - Prefer same-score opponents
 * - Avoid rematches whenever possible
 * - If a same-score pairing would be a rematch (or impossible without rematch), float DOWN
 *   to the best-available lower-score opponent before allowing same-score rematches
 */
function pairTopDown(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
): {
  pairings: Pairing[];
  paired: Set<string>;
} {
  const sorted = [...pool].sort(swissOrder);
  const paired = new Set<string>();

  const hasPlayed = (aId: string, bId: string) =>
    havePlayedBefore(aId, bId, previousPairings);

  type Candidate = {
    oppIdx: number;
    cost: number; // lower is better
  };

  const pairCost = (a: PlayerStanding, b: PlayerStanding): number => {
    const isRematch = hasPlayed(a.id, b.id);
    const downFloat = Math.max(0, a.matchPoints - b.matchPoints);
    // Large penalty for rematch; smaller penalty for floating further down.
    return (
      (isRematch ? 1_000_000 : 0) + downFloat * 1_000 + Math.abs(downFloat)
    );
  };

  const buildCandidates = (aIdx: number): Candidate[] => {
    const a = sorted[aIdx]!;
    const candidates: Candidate[] = [];
    for (let j = aIdx + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (paired.has(b.id)) continue;
      if (b.id === a.id) continue;
      if (b.matchPoints > a.matchPoints) continue; // never float upward
      candidates.push({ oppIdx: j, cost: pairCost(a, b) });
    }

    // Order: same-points non-rematch first, then closest-down non-rematch,
    // then same-points rematch, then closest-down rematch.
    candidates.sort((x, y) => {
      const bx = sorted[x.oppIdx]!;
      const by = sorted[y.oppIdx]!;
      const ax = sorted[aIdx]!;
      const sx = bx.matchPoints === ax.matchPoints ? 0 : 1;
      const sy = by.matchPoints === ax.matchPoints ? 0 : 1;
      if (sx !== sy) return sx - sy;

      const rx = hasPlayed(ax.id, bx.id) ? 1 : 0;
      const ry = hasPlayed(ax.id, by.id) ? 1 : 0;
      if (rx !== ry) return rx - ry;

      const dx = Math.max(0, ax.matchPoints - bx.matchPoints);
      const dy = Math.max(0, ax.matchPoints - by.matchPoints);
      if (dx !== dy) return dx - dy;

      if (x.cost !== y.cost) return x.cost - y.cost;
      // deterministic tie-break
      return swissOrder(bx, by);
    });

    return candidates;
  };

  const pickNextUnpairedIndex = (): number => {
    for (let i = 0; i < sorted.length; i++) {
      if (!paired.has(sorted[i]!.id)) return i;
    }
    return -1;
  };

  let best: { pairings: Pairing[]; cost: number } | null = null;

  const dfs = (current: Pairing[], currentCost: number) => {
    if (best && currentCost >= best.cost) return; // branch-and-bound

    const i = pickNextUnpairedIndex();
    if (i === -1) {
      best = { pairings: [...current], cost: currentCost };
      return;
    }

    const a = sorted[i]!;
    paired.add(a.id);

    const candidates = buildCandidates(i);
    for (const cand of candidates) {
      const b = sorted[cand.oppIdx]!;
      if (paired.has(b.id)) continue;

      paired.add(b.id);
      current.push({
        player1Id: a.id,
        player1Name: a.name,
        player2Id: b.id,
        player2Name: b.name,
        roundNumber,
      });

      dfs(current, currentCost + cand.cost);

      current.pop();
      paired.delete(b.id);

      // If we found a perfect (no rematch) solution, stop exploring worse branches early.
      if (best && best.cost === 0) break;
    }

    paired.delete(a.id);
  };

  dfs([], 0);

  const pairings = best?.pairings ?? [];
  const finalPaired = new Set<string>();
  for (const p of pairings) {
    finalPaired.add(p.player1Id);
    if (p.player2Id) finalPaired.add(p.player2Id);
  }

  return { pairings, paired: finalPaired };
}

/**
 * Generate Swiss pairings for a round.
 * Rules:
 * - Bye priority: lowest score, then fewest previous byes.
 * - Score-group integrity: maximise same-score pairings; one floater from odd groups.
 * - Floating: when a score group is odd, float one player (lowest in group) to the next group.
 */
export function generateSwissPairings(
  standings: PlayerStanding[],
  roundNumber: number,
  previousPairings: Pairing[],
): Pairing[] {
  const pairings: Pairing[] = [];

  if (roundNumber === 1) {
    // Round 1: bye to lowest score, fewest byes (then id); pair the rest randomly
    const byPriority = [...standings].sort(byePriority);
    const isOdd = byPriority.length % 2 === 1;
    let toPair = byPriority;
    let byePlayer: PlayerStanding | null = null;
    if (isOdd) {
      byePlayer = byPriority[0]!; // Bye to lowest score, fewest byes (first in asc order)
      toPair = byPriority.slice(1);
    }
    const shuffled = [...toPair].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        pairings.push({
          player1Id: shuffled[i].id,
          player1Name: shuffled[i].name,
          player2Id: shuffled[i + 1].id,
          player2Name: shuffled[i + 1].name,
          roundNumber,
        });
      }
    }
    if (byePlayer) {
      pairings.push({
        player1Id: byePlayer.id,
        player1Name: byePlayer.name,
        player2Id: null,
        player2Name: null,
        roundNumber,
      });
    }
    return pairings;
  }

  // Subsequent rounds: bye priority, then score groups with float-down logic
  const isOddTotal = standings.length % 2 === 1;

  let pool = standings;
  let byePlayer: PlayerStanding | null = null;
  if (isOddTotal) {
    const sortedByBye = [...standings].sort(byePriority);
    byePlayer = sortedByBye[0]!; // Bye to lowest score, fewest previous byes
    pool = standings.filter((p) => p.id !== byePlayer!.id);
  }

  // Strict top-down pairing across the whole field.
  // This naturally pairs highest scores first, and floats down before allowing rematches
  // within the same score group.
  const result = pairTopDown(pool, previousPairings, roundNumber);
  result.pairings.forEach((p) => pairings.push(p));

  if (byePlayer) {
    pairings.push({
      player1Id: byePlayer.id,
      player1Name: byePlayer.name,
      player2Id: null,
      player2Name: null,
      roundNumber,
    });
  }

  return pairings;
}
