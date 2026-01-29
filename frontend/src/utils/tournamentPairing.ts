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

export interface PairingDecisionLog {
  byeReason?: string; // Why this player received the bye
  byePlayerId?: string; // ID of player who received the bye
  byePlayerName?: string; // Name of player who received the bye
  byePlayerPoints?: number; // Points of player who received the bye
  floatReasons: Map<string, string>; // playerId -> reason for floating down
  maxFloatDistance: number; // Maximum points difference in any float
  rematchCount: number; // Number of rematches (if any)
  stageUsed: number; // Which stage was used (1-5)
  floatDetails?: Array<{
    playerId: string;
    playerName: string;
    playerPoints: number;
    reason: string;
  }>; // Detailed float information for display
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash32(input: string): number {
  // FNV-1a 32-bit (deterministic "seeded random" ordering)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Compare for bye priority (hard rule):
 * - fewest byes
 * - then lowest points
 * - then seeded tie-break (deterministic)
 */
function byePriority(seed: string) {
  return (a: PlayerStanding, b: PlayerStanding): number => {
    const aByes = a.byesReceived ?? 0;
    const bByes = b.byesReceived ?? 0;
    if (aByes !== bByes) return aByes - bByes;
    if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;
    return hash32(`${seed}:${a.id}`) - hash32(`${seed}:${b.id}`);
  };
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
 * Staged Swiss solver (hard constraints first, relax only when unavoidable).
 *
 * Stages:
 * 1) same-score only, no rematches
 * 2) max 1-step float down, no rematches
 * 3) any float down, no rematches
 * 4) max 1-step float down, allow rematches
 * 5) any float down, allow rematches
 */
function solveSwissRound(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
): {
  pairings: Pairing[];
  paired: Set<string>;
  usedRematch: boolean;
  maxDownFloatUsed: number;
  stageUsed: number;
  stagesTried: { stage: number; complete: boolean }[];
  floatReasons: Map<string, string>; // playerId -> reason for floating down
} {
  const sorted = [...pool].sort(swissOrder);
  const paired = new Set<string>();

  const hasPlayed = (aId: string, bId: string) =>
    havePlayedBefore(aId, bId, previousPairings);

  const pickNextUnpairedIndex = (): number => {
    for (let i = 0; i < sorted.length; i++) {
      if (!paired.has(sorted[i]!.id)) return i;
    }
    return -1;
  };

  type Stage = {
    stage: number;
    maxDownFloat: number | null; // 0 => same-score only; 1 => adjacent; null => any
    allowRematch: boolean;
  };

  const stages: Stage[] = [
    { stage: 1, maxDownFloat: 0, allowRematch: false },
    { stage: 2, maxDownFloat: 1, allowRematch: false },
    { stage: 3, maxDownFloat: null, allowRematch: false },
    { stage: 4, maxDownFloat: 1, allowRematch: true },
    { stage: 5, maxDownFloat: null, allowRematch: true },
  ];

  const stagesTried: { stage: number; complete: boolean }[] = [];
  const floatReasons = new Map<string, string>();

  const solveWithStage = (s: Stage) => {
    type Candidate = { oppIdx: number; cost: number; reason?: string };

    const isAllowedPair = (a: PlayerStanding, b: PlayerStanding): boolean => {
      if (a.id === b.id) return false;
      if (b.matchPoints > a.matchPoints) return false; // never float upward
      const downFloat = a.matchPoints - b.matchPoints;
      if (s.maxDownFloat !== null && downFloat > s.maxDownFloat) return false;
      if (!s.allowRematch && hasPlayed(a.id, b.id)) return false;
      return true;
    };

    const pairCost = (a: PlayerStanding, b: PlayerStanding): number => {
      const isRematch = hasPlayed(a.id, b.id);
      const downFloat = Math.max(0, a.matchPoints - b.matchPoints);

      // "Rather a 2-step float than a rematch"
      // Keep rematches far more expensive than multi-step floats.
      const rematchPenalty = 5_000_000;
      const multiStepPenalty = downFloat > 1 ? (downFloat - 1) * 200_000 : 0;
      return (
        (isRematch ? rematchPenalty : 0) +
        multiStepPenalty +
        downFloat * 10_000 +
        Math.abs(downFloat)
      );
    };

    const buildCandidates = (aIdx: number): Candidate[] => {
      const a = sorted[aIdx]!;
      const candidates: Candidate[] = [];

      // Check for same-score opponents first
      const sameScoreOpponents = sorted
        .slice(aIdx + 1)
        .filter(
          (b) =>
            !paired.has(b.id) &&
            b.matchPoints === a.matchPoints &&
            isAllowedPair(a, b),
        );

      for (let j = aIdx + 1; j < sorted.length; j++) {
        const b = sorted[j]!;
        if (paired.has(b.id)) continue;
        if (!isAllowedPair(a, b)) continue;

        const downFloat = a.matchPoints - b.matchPoints;
        const isRematch = hasPlayed(a.id, b.id);

        // Generate reason for this pairing
        let reason = "";
        if (b.matchPoints === a.matchPoints) {
          if (sameScoreOpponents.length === 0) {
            reason = "no legal same-bracket opponents available";
          } else if (isRematch) {
            reason = `all ${sameScoreOpponents.length} same-bracket opponents are rematches`;
          } else {
            reason = "same-bracket pairing"; // Normal case, no float
          }
        } else {
          // Float down
          if (sameScoreOpponents.length === 0) {
            reason = `no legal same-bracket opponents (${downFloat}-point float down)`;
          } else if (
            sameScoreOpponents.every((opp) => hasPlayed(a.id, opp.id))
          ) {
            reason = `all ${sameScoreOpponents.length} same-bracket opponents are rematches (${downFloat}-point float down)`;
          } else {
            reason = `same-bracket pairing blocked, ${downFloat}-point float down`;
          }
        }

        candidates.push({ oppIdx: j, cost: pairCost(a, b), reason });
      }

      // Deterministic preference:
      // - same-score first
      // - then smaller float distance
      // - then lower cost
      // - then swissOrder tie-break
      candidates.sort((x, y) => {
        const bx = sorted[x.oppIdx]!;
        const by = sorted[y.oppIdx]!;
        const ax = sorted[aIdx]!;

        const sx = bx.matchPoints === ax.matchPoints ? 0 : 1;
        const sy = by.matchPoints === ax.matchPoints ? 0 : 1;
        if (sx !== sy) return sx - sy;

        const dx = ax.matchPoints - bx.matchPoints;
        const dy = ax.matchPoints - by.matchPoints;
        if (dx !== dy) return dx - dy;

        if (x.cost !== y.cost) return x.cost - y.cost;
        return swissOrder(bx, by);
      });

      return candidates;
    };

    let bestCost = Number.POSITIVE_INFINITY;
    let bestPairings: Pairing[] = [];

    const dfs = (current: Pairing[], currentCost: number) => {
      if (currentCost >= bestCost) return;

      const i = pickNextUnpairedIndex();
      if (i === -1) {
        bestCost = currentCost;
        bestPairings = [...current];
        return;
      }

      const a = sorted[i]!;
      paired.add(a.id);
      const candidates = buildCandidates(i);
      for (const cand of candidates) {
        const b = sorted[cand.oppIdx]!;
        if (paired.has(b.id)) continue;
        paired.add(b.id);

        // Note: Float reasons will be captured after final pairing is determined

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

        // Perfect means: no float beyond allowed (already) and no rematch unless allowed (already).
        if (bestCost === 0) break;
      }
      paired.delete(a.id);
    };

    dfs([], 0);
    return bestPairings;
  };

  let chosenStage = stages[stages.length - 1]!;
  let pairings: Pairing[] = [];
  for (const s of stages) {
    // Ensure clean state for each stage run
    paired.clear();
    floatReasons.clear();
    const result = solveWithStage(s);
    const complete = result.length * 2 === sorted.length;
    stagesTried.push({ stage: s.stage, complete });
    if (complete) {
      chosenStage = s;
      pairings = result;
      break;
    }
  }

  const finalPaired = new Set<string>();
  for (const p of pairings) {
    finalPaired.add(p.player1Id);
    if (p.player2Id) finalPaired.add(p.player2Id);
  }

  // Re-analyze final pairings to capture float reasons accurately
  const finalFloatReasons = new Map<string, string>();
  let usedRematch = false;
  let maxDownFloatUsed = 0;

  for (const p of pairings) {
    if (p.player2Id) {
      usedRematch ||= hasPlayed(p.player1Id, p.player2Id);
      const a = sorted.find((x) => x.id === p.player1Id);
      const b = sorted.find((x) => x.id === p.player2Id);
      if (a && b) {
        const downFloat = a.matchPoints - b.matchPoints;
        maxDownFloatUsed = Math.max(maxDownFloatUsed, downFloat);

        // Generate float reason for final pairing
        if (downFloat > 0) {
          const sameScoreOpponents = sorted.filter(
            (opp) =>
              opp.id !== a.id &&
              opp.id !== b.id &&
              opp.matchPoints === a.matchPoints &&
              finalPaired.has(opp.id),
          );

          const sameScoreRematches = sameScoreOpponents.filter((opp) =>
            hasPlayed(a.id, opp.id),
          );

          let reason = "";
          if (sameScoreOpponents.length === 0) {
            reason = `no legal same-bracket opponents available (${downFloat}-point float)`;
          } else if (sameScoreRematches.length === sameScoreOpponents.length) {
            reason = `all ${sameScoreOpponents.length} same-bracket opponents are rematches (${downFloat}-point float)`;
          } else {
            reason = `same-bracket pairing blocked, ${downFloat}-point float down`;
          }

          finalFloatReasons.set(a.id, reason);
        }
      }
    }
  }

  // Merge with any reasons captured during DFS
  floatReasons.forEach((reason, playerId) => {
    if (!finalFloatReasons.has(playerId)) {
      finalFloatReasons.set(playerId, reason);
    }
  });

  return {
    pairings,
    paired: finalPaired,
    usedRematch,
    maxDownFloatUsed,
    stageUsed: chosenStage.stage,
    stagesTried,
    floatReasons: finalFloatReasons,
  };
}

/**
 * Generate Swiss pairings for a round.
 * Rules:
 * - Bye priority: lowest score, then fewest previous byes.
 * - Score-group integrity: maximise same-score pairings; one floater from odd groups.
 * - Floating: when a score group is odd, float one player (lowest in group) to the next group.
 */
export interface PairingResult {
  pairings: Pairing[];
  decisionLog?: PairingDecisionLog;
}

export function generateSwissPairings(
  standings: PlayerStanding[],
  roundNumber: number,
  previousPairings: Pairing[],
): PairingResult {
  const pairings: Pairing[] = [];

  const sortPairingsHighFirst = (
    ps: Pairing[],
    standingsById: Map<string, PlayerStanding>,
  ) => {
    const pointsOf = (id: string) => standingsById.get(id)?.matchPoints ?? 0;
    return [...ps].sort((a, b) => {
      // Byes ALWAYS last - check this first and enforce strictly
      const aIsBye = a.player2Id === null;
      const bIsBye = b.player2Id === null;
      if (aIsBye && !bIsBye) return 1; // bye comes after non-bye
      if (!aIsBye && bIsBye) return -1; // non-bye comes before bye
      if (aIsBye && bIsBye) {
        // Both are byes - sort by player points (lower first, deterministic)
        const aPts = pointsOf(a.player1Id);
        const bPts = pointsOf(b.player1Id);
        if (aPts !== bPts) return aPts - bPts;
        return a.player1Id.localeCompare(b.player1Id);
      }

      // Neither is a bye - sort by highest table first
      const a1 = pointsOf(a.player1Id);
      const a2 = pointsOf(a.player2Id!);
      const b1 = pointsOf(b.player1Id);
      const b2 = pointsOf(b.player2Id!);

      const aTop = Math.max(a1, a2);
      const bTop = Math.max(b1, b2);
      if (aTop !== bTop) return bTop - aTop; // highest table first

      const aSum = a1 + a2;
      const bSum = b1 + b2;
      if (aSum !== bSum) return bSum - aSum;

      // deterministic fallback
      const aKey = `${a.player1Id}-${a.player2Id}`;
      const bKey = `${b.player1Id}-${b.player2Id}`;
      return aKey.localeCompare(bKey);
    });
  };

  // ----------------------------
  // Hard assertions (input)
  // ----------------------------
  assert(roundNumber >= 1, "Invalid roundNumber");

  const ids = standings.map((s) => s.id);
  assert(new Set(ids).size === ids.length, "Duplicate player ids in standings");
  for (const s of standings) {
    assert(s.id && s.name, "Invalid player in standings");
    assert(s.wins >= 0 && s.losses >= 0 && s.draws >= 0, "Invalid W/L/D");
    assert(s.matchesPlayed >= 0, "Invalid matchesPlayed");
    const computed = calculateMatchPoints(s.wins, s.draws);
    assert(
      computed === s.matchPoints,
      `Data integrity: matchPoints mismatch for ${s.id} (${s.name})`,
    );
  }

  if (roundNumber === 1) {
    // Round 1: bye to lowest score, fewest byes (then id); pair the rest randomly
    const byPriority = [...standings].sort(byePriority(`bye:r1`));
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
    const standingsById = new Map(standings.map((s) => [s.id, s]));
    const out = sortPairingsHighFirst(pairings, standingsById);
    // Hard assertions (output)
    const used = new Set<string>();
    const seenMatches = new Set<string>();
    const byes = out.filter((p) => p.player2Id === null).length;
    assert(byes === (standings.length % 2 === 1 ? 1 : 0), "Invalid bye count");
    for (const p of out) {
      assert(p.player1Id, "Invalid pairing: missing player1");
      assert(p.player2Id !== p.player1Id, "Invalid pairing: self-pairing");
      assert(!used.has(p.player1Id), "Player paired more than once");
      used.add(p.player1Id);
      if (p.player2Id) {
        assert(!used.has(p.player2Id), "Player paired more than once");
        used.add(p.player2Id);
      }
      const a = p.player1Id;
      const b = p.player2Id ?? "bye";
      const key =
        a < b ? `${a}|${b}|r${roundNumber}` : `${b}|${a}|r${roundNumber}`;
      assert(!seenMatches.has(key), "Duplicate match object detected");
      seenMatches.add(key);
    }
    assert(
      used.size === standings.length,
      "Not every player appears exactly once (round 1)",
    );
    return { pairings: out };
  }

  // Subsequent rounds: bye priority, then score groups with float-down logic
  const isOddTotal = standings.length % 2 === 1;

  let pool = standings;
  let byePlayer: PlayerStanding | null = null;
  let byeReason = "";
  if (isOddTotal) {
    const sortedByBye = [...standings].sort(byePriority(`bye:r${roundNumber}`));
    byePlayer = sortedByBye[0]!; // Bye to lowest score, fewest previous byes

    // Determine bye reason
    const sameScorePlayers = standings.filter(
      (p) => p.matchPoints === byePlayer!.matchPoints,
    );
    const lowerScorePlayers = standings.filter(
      (p) => p.matchPoints < byePlayer!.matchPoints,
    );

    if (lowerScorePlayers.length > 0) {
      const lowerByes = lowerScorePlayers.filter((p) => p.byesReceived === 0);
      if (lowerByes.length > 0) {
        byeReason = `all ${lowerByes.length} lower-scored players already received bye`;
      } else {
        byeReason = `all lower-scored players already received bye (fewest byes: ${byePlayer.byesReceived})`;
      }
    } else {
      byeReason = `lowest score (${byePlayer.matchPoints} pts), fewest byes (${byePlayer.byesReceived})`;
    }

    pool = standings.filter((p) => p.id !== byePlayer!.id);
  }

  const result = solveSwissRound(pool, previousPairings, roundNumber);
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

  // Log unavoidable decisions
  if (roundNumber >= 4) {
    console.group(`[Round ${roundNumber}] Pairing Decisions`);

    if (byePlayer) {
      console.log(
        `Bye: ${byePlayer.name} (${byePlayer.matchPoints} pts, ${byePlayer.byesReceived} byes) - ${byeReason}`,
      );
    }

    if (result.floatReasons.size > 0) {
      console.log("Floats:");
      result.floatReasons.forEach((reason, playerId) => {
        const player = standings.find((p) => p.id === playerId);
        if (player) {
          console.log(
            `  ${player.name} (${player.matchPoints} pts): ${reason}`,
          );
        }
      });
    }

    console.log(
      `Max float distance: ${result.maxDownFloatUsed} points${result.maxDownFloatUsed > 1 ? " (multi-step)" : ""}`,
    );

    if (result.usedRematch) {
      console.log(
        `Rematches used: Stage ${result.stageUsed} required (stages 1-3 incomplete)`,
      );
    }

    console.log(`Solver stage used: ${result.stageUsed}`);
    console.groupEnd();
  }

  const standingsById = new Map(standings.map((s) => [s.id, s]));
  const out = sortPairingsHighFirst(pairings, standingsById);

  // ----------------------------
  // Hard assertions (output)
  // ----------------------------
  const used = new Set<string>();
  const seenMatches = new Set<string>();
  const byes = out.filter((p) => p.player2Id === null).length;
  assert(byes === (standings.length % 2 === 1 ? 1 : 0), "Invalid bye count");

  // Determine if rematches are mathematically unavoidable:
  // if stageUsed >= 4, then stages 1-3 (no-rematch) were incomplete.
  const rematchesUnavoidable = result.stageUsed >= 4;
  const multiStepFloatsUnavoidable =
    result.maxDownFloatUsed > 1 && result.stageUsed >= 3; // stage 1/2 disallow >1

  for (const p of out) {
    assert(p.player1Id, "Invalid pairing: missing player1");
    assert(p.player2Id !== p.player1Id, "Invalid pairing: self-pairing");

    assert(!used.has(p.player1Id), "Player paired more than once");
    used.add(p.player1Id);
    if (p.player2Id) {
      assert(!used.has(p.player2Id), "Player paired more than once");
      used.add(p.player2Id);
    }

    const a = p.player1Id;
    const b = p.player2Id ?? "bye";
    const key =
      a < b ? `${a}|${b}|r${roundNumber}` : `${b}|${a}|r${roundNumber}`;
    assert(!seenMatches.has(key), "Duplicate match object detected");
    seenMatches.add(key);

    if (p.player2Id) {
      const isRematch = havePlayedBefore(
        p.player1Id,
        p.player2Id,
        previousPairings,
      );
      assert(
        !isRematch || rematchesUnavoidable,
        "Swiss constraint violated: rematch while avoidable",
      );

      const aPts = standingsById.get(p.player1Id)?.matchPoints ?? 0;
      const bPts = standingsById.get(p.player2Id)?.matchPoints ?? 0;
      const downFloat = Math.max(0, aPts - bPts);
      assert(
        downFloat <= 1 || multiStepFloatsUnavoidable,
        "Swiss constraint violated: >1 score-step float while avoidable",
      );
    }
  }

  assert(
    used.size === standings.length,
    "Not every player appears exactly once (or receives a bye)",
  );

  // Build decision log with detailed float information
  const floatDetails: Array<{
    playerId: string;
    playerName: string;
    playerPoints: number;
    reason: string;
  }> = [];

  result.floatReasons.forEach((reason, playerId) => {
    const player = standings.find((p) => p.id === playerId);
    if (player) {
      floatDetails.push({
        playerId: player.id,
        playerName: player.name,
        playerPoints: player.matchPoints,
        reason,
      });
    }
  });

  const decisionLog: PairingDecisionLog = {
    byeReason: byePlayer ? byeReason : undefined,
    byePlayerId: byePlayer ? byePlayer.id : undefined,
    byePlayerName: byePlayer ? byePlayer.name : undefined,
    byePlayerPoints: byePlayer ? byePlayer.matchPoints : undefined,
    floatReasons: result.floatReasons,
    maxFloatDistance: result.maxDownFloatUsed,
    rematchCount: result.usedRematch ? 1 : 0,
    stageUsed: result.stageUsed,
    floatDetails,
  };

  return { pairings: out, decisionLog };
}

/**
 * Generate round 1 pairings for a tournament.
 * Swiss: uses generateSwissPairings with zero points.
 * Single elimination: shuffle and pair sequentially (bye for odd player).
 */
export function generateRound1Pairings(
  tournamentType: string,
  players: Array<{ id: string; name: string }>,
): Pairing[] {
  if (tournamentType === "swiss") {
    const standings: PlayerStanding[] = players.map((p) => ({
      id: p.id,
      name: p.name,
      matchPoints: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      opponents: [],
      byesReceived: 0,
    }));
    const result = generateSwissPairings(standings, 1, []);
    return result.pairings;
  }

  // Single elimination: shuffle then pair in order (bye for odd player)
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const pairings: Pairing[] = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i]!;
    if (i + 1 < shuffled.length) {
      const p2 = shuffled[i + 1]!;
      pairings.push({
        player1Id: p1.id,
        player1Name: p1.name,
        player2Id: p2.id,
        player2Name: p2.name,
        roundNumber: 1,
      });
    } else {
      pairings.push({
        player1Id: p1.id,
        player1Name: p1.name,
        player2Id: null,
        player2Name: null,
        roundNumber: 1,
      });
    }
  }

  return pairings;
}
