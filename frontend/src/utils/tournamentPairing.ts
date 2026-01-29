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
 * Who should float when a bracket is odd: fewest byes, then lowest points, then id.
 * (So the "lowest" in the group floats down.)
 */
function floatPriority(a: PlayerStanding, b: PlayerStanding): number {
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;
  return a.id.localeCompare(b.id);
}

/**
 * Get score groups as array sorted by points descending (highest bracket first).
 */
function getScoreGroupsSorted(
  pool: PlayerStanding[],
): Array<{ points: number; players: PlayerStanding[] }> {
  const map = groupByMatchPoints(pool);
  const entries = Array.from(map.entries())
    .map(([points, players]) => ({ points, players }))
    .sort((a, b) => b.points - a.points);
  return entries;
}

/**
 * Pair an even-sized pool within the bracket. Prefer same-score, no rematches.
 * Returns pairings. Greedy deterministic: sort by pairingOrder, then for each
 * unpaired player pick best unpaired opponent (same score no rematch > same score rematch > float).
 */
function pairEvenPool(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
): Pairing[] {
  const sorted = [...pool].sort(pairingOrder);
  const paired = new Set<string>();
  const hasPlayed = (a: string, b: string) =>
    havePlayedBefore(a, b, previousPairings);
  const pairings: Pairing[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    if (paired.has(a.id)) continue;

    // Best opponent: same score no rematch, then same score rematch, then float (lower score)
    let bestJ = -1;
    let bestScore = -1; // 2 = same no rematch, 1 = same rematch, 0 = float

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (paired.has(b.id)) continue;

      const sameScore = a.matchPoints === b.matchPoints;
      const rematch = hasPlayed(a.id, b.id);
      let score = 0;
      if (sameScore && !rematch) score = 2;
      else if (sameScore && rematch) score = 1;
      else if (a.matchPoints > b.matchPoints)
        score = 0; // a floats down, allowed
      else if (b.matchPoints > a.matchPoints)
        score = 0; // b floats down to a, allowed (so low-point player gets paired when processed first)
      else continue; // same score already handled above

      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }

    if (bestJ >= 0) {
      const b = sorted[bestJ]!;
      paired.add(a.id);
      paired.add(b.id);
      pairings.push({
        player1Id: a.id,
        player1Name: a.name,
        player2Id: b.id,
        player2Name: b.name,
        roundNumber,
      });
    }
  }

  return pairings;
}

/**
 * Process one bracket: pair within the pool. If odd, exactly one player floats down
 * (the "lowest" in the group by floatPriority). Do not look at lower groups yet.
 */
function processBracket(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
  floatReasons: Map<string, string>,
): { pairings: Pairing[]; floatDown: PlayerStanding | null } {
  if (pool.length === 0) {
    return { pairings: [], floatDown: null };
  }

  // Who floats if odd: first in floatPriority order (fewest byes, then lowest points, then id)
  const sorted = [...pool].sort(floatPriority);

  if (sorted.length % 2 === 1) {
    const floatDown = sorted[0]!;
    const toPair = sorted.slice(1);
    const pairings = pairEvenPool(toPair, previousPairings, roundNumber);
    const points = floatDown.matchPoints;
    floatReasons.set(
      floatDown.id,
      `odd bracket (${points} pts), one player floats to next bracket`,
    );
    return { pairings, floatDown };
  }

  const pairings = pairEvenPool(pool, previousPairings, roundNumber);
  return { pairings, floatDown: null };
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

  // Subsequent rounds: bye priority, then hard-partition by score bracket.
  // Correct Swiss flow: group by score, process each bracket (highest first).
  // For each bracket independently: pair everyone inside; if odd, exactly one player
  // floats down (by floatPriority). That floater is appended to the top of the next
  // lower bracket; we do not look at lower groups until the current bracket is done.
  // Only one float per bracket unless rematches force more (we currently do one float per odd bracket).
  const isOddTotal = standings.length % 2 === 1;

  let pool = standings;
  let byePlayer: PlayerStanding | null = null;
  let byeReason = "";
  if (isOddTotal) {
    const sortedByBye = [...standings].sort(byePriority(`bye:r${roundNumber}`));
    byePlayer = sortedByBye[0]!; // Bye to lowest score, fewest previous byes

    // Determine bye reason
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

  const floatReasons = new Map<string, string>();
  const groups = getScoreGroupsSorted(pool);
  let carryOver: PlayerStanding | null = null;

  for (const { players: groupPlayers } of groups) {
    const currentPool =
      carryOver !== null ? [carryOver, ...groupPlayers] : [...groupPlayers];
    const result = processBracket(
      currentPool,
      previousPairings,
      roundNumber,
      floatReasons,
    );
    for (const p of result.pairings) {
      pairings.push(p);
    }
    carryOver = result.floatDown;
  }

  assert(
    carryOver === null,
    "Pool after bye must be even; one bracket should not leave a floater",
  );

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
  let usedRematch = false;
  let maxDownFloatUsed = 0;
  for (const p of pairings) {
    if (p.player2Id) {
      usedRematch =
        usedRematch ||
        havePlayedBefore(p.player1Id, p.player2Id, previousPairings);
      const a = standingsById.get(p.player1Id);
      const b = standingsById.get(p.player2Id);
      if (a && b) {
        const diff = Math.abs(a.matchPoints - b.matchPoints);
        maxDownFloatUsed = Math.max(maxDownFloatUsed, diff);
      }
    }
  }

  // Log unavoidable decisions
  if (roundNumber >= 4) {
    console.group(`[Round ${roundNumber}] Pairing Decisions`);

    if (byePlayer) {
      console.log(
        `Bye: ${byePlayer.name} (${byePlayer.matchPoints} pts, ${byePlayer.byesReceived} byes) - ${byeReason}`,
      );
    }

    if (floatReasons.size > 0) {
      console.log("Floats:");
      floatReasons.forEach((reason, playerId) => {
        const player = standings.find((p) => p.id === playerId);
        if (player) {
          console.log(
            `  ${player.name} (${player.matchPoints} pts): ${reason}`,
          );
        }
      });
    }

    console.log(
      `Max float distance: ${maxDownFloatUsed} points${maxDownFloatUsed > 1 ? " (multi-step)" : ""}`,
    );

    if (usedRematch) {
      console.log("Rematches used (unavoidable within bracket constraints)");
    }

    console.log(
      "Pairing method: hard-partition by score bracket, one float per odd bracket",
    );
    console.groupEnd();
  }

  const out = sortPairingsHighFirst(pairings, standingsById);

  // ----------------------------
  // Hard assertions (output)
  // ----------------------------
  const used = new Set<string>();
  const seenMatches = new Set<string>();
  const byes = out.filter((p) => p.player2Id === null).length;
  assert(byes === (standings.length % 2 === 1 ? 1 : 0), "Invalid bye count");

  const rematchesUnavoidable = usedRematch;
  const multiStepFloatsUnavoidable = maxDownFloatUsed > 1;

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

  floatReasons.forEach((reason, playerId) => {
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
    floatReasons,
    maxFloatDistance: maxDownFloatUsed,
    rematchCount: usedRematch ? 1 : 0,
    stageUsed: 1, // Bracket-by-bracket (hard-partition by score, one float per odd bracket)
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
