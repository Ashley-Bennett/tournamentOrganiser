/**
 * Swiss Pairing Algorithm (bracket-first implementation).
 *
 * Rules: Win = 3 pts, Draw = 1 pt, Loss = 0 pts, Bye = 3 pts.
 * - Players grouped by match points (score brackets); pair within bracket first.
 * - Odd bracket: exactly one player floats down to the next lower bracket.
 * - Bye: lowest score, then fewest byes received, then stable tie-breaker (player ID).
 * - Rematches avoided unless no legal pairing exists; determinism via player ID.
 *
 * Reference: Play! Pokémon Tournament Rules Handbook (Section 5.3, 5.6).
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

function roundLevelInvariantCheck(
  out: Pairing[],
  standings: PlayerStanding[],
  roundNumber: number,
): void {
  const expectedPairings = Math.ceil(standings.length / 2);
  if (out.length !== expectedPairings) {
    throw new Error(
      `Incorrect pairings count: expected ${expectedPairings}, got ${out.length} [roundNumber=${roundNumber} standings.length=${standings.length}]`,
    );
  }
  const used = new Set<string>();
  const duplicates: string[] = [];
  const standingsIds = new Set(standings.map((s) => s.id));
  for (const p of out) {
    if (!p.player1Id)
      throw new Error(
        `Invalid pairing: missing player1 [roundNumber=${roundNumber}]`,
      );
    if (p.player2Id === p.player1Id)
      throw new Error(
        `Invalid pairing: self-pairing [roundNumber=${roundNumber}]`,
      );
    for (const id of [p.player1Id, p.player2Id]) {
      if (id == null) continue;
      if (used.has(id)) duplicates.push(id);
      else used.add(id);
    }
  }
  const missing = [...standingsIds].filter((id) => !used.has(id));
  if (
    used.size !== standings.length ||
    missing.length > 0 ||
    duplicates.length > 0
  ) {
    throw new Error(
      `Round invariant violated: used.size=${used.size} standings.length=${standings.length} [roundNumber=${roundNumber}] ` +
        `standingsIds=[${[...standingsIds].join(",")}] usedIds=[${[
          ...used,
        ].join(",")}] ` +
        `missing=[${missing.join(",")}] duplicates=[${duplicates.join(",")}]`,
    );
  }
  const byes = out.filter((p) => p.player2Id === null).length;
  if (byes !== (standings.length % 2 === 1 ? 1 : 0)) {
    throw new Error(
      `Invalid bye count: expected ${
        standings.length % 2 === 1 ? 1 : 0
      }, got ${byes} [roundNumber=${roundNumber}]`,
    );
  }
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
 * Bye priority (Swiss):
 * - lowest matchPoints first
 * - then fewest byes
 * - then deterministic seeded tie-break
 */
function byePriority(seed: string) {
  return (a: PlayerStanding, b: PlayerStanding): number => {
    if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;

    const aByes = a.byesReceived ?? 0;
    const bByes = b.byesReceived ?? 0;
    if (aByes !== bByes) return aByes - bByes;

    return hash32(`${seed}:${a.id}`) - hash32(`${seed}:${b.id}`);
  };
}

/**
 * Algorithm comparator for pairing. Use when pool may have mixed matchPoints.
 * Points DESC first, then byes ASC, then id. Never use pairingOrder on mixed pools.
 */
function compareForPairing(a: PlayerStanding, b: PlayerStanding): number {
  if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
}

/**
 * Sort order for pairing within a SAME-SCORE group only: byes ASC, then id.
 * Do NOT use on mixed pools; use compareForPairing instead.
 */
function pairingOrder(a: PlayerStanding, b: PlayerStanding): number {
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
 * Who should float when a bracket is odd: the "worst" in the group floats down.
 * Groups are already isolated by matchPoints, so we only compare byes then id.
 */
function floatPriority(a: PlayerStanding, b: PlayerStanding): number {
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return bByes - aByes; // MOST byes floats
  return b.id.localeCompare(a.id); // deterministic "worst" by id
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

/** Context for pairing errors (reproducibility) */
interface PairingContext {
  roundNumber: number;
  bracketPoints?: number[];
  carryOverId?: string | null;
  previousPairingsCount: number;
}

function buildPairingError(
  msg: string,
  ctx: PairingContext,
  extra?: Record<string, unknown>,
): string {
  let s = `${msg} [roundNumber=${ctx.roundNumber} previousPairings=${ctx.previousPairingsCount}`;
  if (ctx.bracketPoints?.length)
    s += ` bracketPoints=[${ctx.bracketPoints.join(",")}]`;
  if (ctx.carryOverId != null) s += ` carryOverId=${ctx.carryOverId}`;
  s += "]";
  if (extra)
    for (const [k, v] of Object.entries(extra))
      s += ` ${k}=${JSON.stringify(v)}`;
  return s;
}

/**
 * Pair an even-sized pool within the bracket. Guarantees a perfect matching (N/2 pairings).
 * Always sorts by compareForPairing (points DESC, then byes, id) — never pairingOrder on mixed pools.
 * Special case: exactly one floater + one lower score group → pair floater with best low.
 */
function pairEvenPool(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
  ctx?: PairingContext,
): Pairing[] {
  const context: PairingContext = ctx ?? {
    roundNumber,
    previousPairingsCount: previousPairings.length,
  };

  if (pool.length % 2 !== 0) {
    throw new Error(
      buildPairingError("pairEvenPool requires an even-sized pool", context, {
        poolSize: pool.length,
      }),
    );
  }

  const sorted = [...pool].sort(compareForPairing);

  const distinctPts = Array.from(
    new Set(sorted.map((p) => p.matchPoints)),
  ).sort((a, b) => b - a);

  if (distinctPts.length === 2) {
    const high = distinctPts[0]!;
    const low = distinctPts[1]!;
    const highPlayers = sorted.filter((p) => p.matchPoints === high);
    const lowPlayers = sorted.filter((p) => p.matchPoints === low);

    if (highPlayers.length === 1) {
      const floater = highPlayers[0]!;
      const lowByBest = [...lowPlayers].sort(pairingOrder);
      const bestLow = lowByBest[0]!;
      const remainingLow = lowByBest.slice(1);
      const pairings: Pairing[] = [
        {
          player1Id: floater.id,
          player1Name: floater.name,
          player2Id: bestLow.id,
          player2Name: bestLow.name,
          roundNumber,
        },
      ];
      if (remainingLow.length > 0) {
        pairings.push(
          ...pairEvenPool(remainingLow, previousPairings, roundNumber, context),
        );
      }
      validatePerfectMatching(pool, pairings, context);
      return pairings;
    }
  }

  const k = sorted.length / 2;
  const top = sorted.slice(0, k);
  const bottom = sorted.slice(k, 2 * k);
  const hasPlayed = (a: string, b: string) =>
    havePlayedBefore(a, b, previousPairings);

  const perm = Array.from({ length: k }, (_, i) => i);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < k; i++) {
      if (!hasPlayed(top[i]!.id, bottom[perm[i]!]!.id)) continue; // no rematch at i
      for (let j = i + 1; j < k; j++) {
        const a = top[i]!.id;
        const b = top[j]!.id;
        const bi = bottom[perm[i]!]!.id;
        const bj = bottom[perm[j]!]!.id;
        const currentIRematch = hasPlayed(a, bi);
        const currentJRematch = hasPlayed(b, bj);
        const afterSwapIRematch = hasPlayed(a, bj);
        const afterSwapJRematch = hasPlayed(b, bi);
        const rematchesBefore =
          (currentIRematch ? 1 : 0) + (currentJRematch ? 1 : 0);
        const rematchesAfter =
          (afterSwapIRematch ? 1 : 0) + (afterSwapJRematch ? 1 : 0);
        if (rematchesAfter < rematchesBefore) {
          [perm[i], perm[j]] = [perm[j]!, perm[i]!];
          changed = true;
          break;
        }
      }
    }
  }

  const pairings: Pairing[] = [];
  for (let i = 0; i < k; i++) {
    const a = top[i]!;
    const b = bottom[perm[i]!]!;
    pairings.push({
      player1Id: a.id,
      player1Name: a.name,
      player2Id: b.id,
      player2Name: b.name,
      roundNumber,
    });
  }
  validatePerfectMatching(pool, pairings, context);
  return pairings;
}

function validatePerfectMatching(
  pool: PlayerStanding[],
  pairings: Pairing[],
  context: PairingContext,
): void {
  const poolIds = new Set(pool.map((p) => p.id));
  const used = new Set<string>();
  const duplicates: string[] = [];
  for (const p of pairings) {
    for (const id of [p.player1Id, p.player2Id]) {
      if (id == null) continue;
      if (used.has(id)) duplicates.push(id);
      else used.add(id);
    }
  }
  const missing = [...poolIds].filter((id) => !used.has(id));
  if (
    used.size !== pool.length ||
    missing.length > 0 ||
    duplicates.length > 0
  ) {
    throw new Error(
      buildPairingError(
        "pairEvenPool produced incomplete or invalid matching",
        context,
        {
          poolIds: [...poolIds],
          usedIds: [...used],
          missing,
          duplicates: duplicates.length ? duplicates : undefined,
        },
      ),
    );
  }
}

/**
 * Process one bracket: pair within the pool. If odd, exactly one player floats down
 * (or receives bye if isLastBracket). Non-last: use floatPriority ("worst" floats).
 * Last bracket odd: use byePriority so the unpaired player is the correct bye recipient.
 */
function processBracket(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
  floatReasons: Map<string, string>,
  isLastBracket: boolean = false,
  carryOverId: string | null = null,
): { pairings: Pairing[]; floatDown: PlayerStanding | null } {
  if (pool.length === 0) {
    return { pairings: [], floatDown: null };
  }

  const bracketPoints = [...new Set(pool.map((p) => p.matchPoints))].sort(
    (a, b) => b - a,
  );
  const ctx: PairingContext = {
    roundNumber,
    bracketPoints,
    carryOverId,
    previousPairingsCount: previousPairings.length,
  };

  const pts = pool.map((p) => p.matchPoints);
  const maxPts = Math.max(...pts);
  const minPts = Math.min(...pts);
  const isMixed = maxPts !== minPts;

  if (pool.length % 2 === 1) {
    // LAST BRACKET: select bye recipient by byePriority (already points-aware)
    if (isLastBracket) {
      const sorted = [...pool].sort(byePriority(`bye:r${roundNumber}`));
      const byePlayer = sorted[0]!;
      const toPair = sorted.slice(1);

      const pairings = pairEvenPool(toPair, previousPairings, roundNumber, ctx);
      assert(
        pairings.length === toPair.length / 2,
        `Bracket pairing incomplete: expected ${
          toPair.length / 2
        } pairings, got ${pairings.length}`,
      );

      floatReasons.set(
        byePlayer.id,
        `bye (lowest bracket, selected by bye priority after float resolution)`,
      );

      return { pairings, floatDown: byePlayer };
    }

    // NON-LAST: float selection must NOT re-float the carryOver when pool is mixed
    let floatDown: PlayerStanding;

    if (isMixed) {
      // float only from the LOWER points subset
      const floatCandidates = pool.filter((p) => p.matchPoints === minPts);
      floatDown = [...floatCandidates].sort(floatPriority)[0]!;
      floatReasons.set(
        floatDown.id,
        `odd mixed bracket (${maxPts}->${minPts}), floated from ${minPts} bracket`,
      );
    } else {
      // normal same-score bracket
      floatDown = [...pool].sort(floatPriority)[0]!;
      floatReasons.set(
        floatDown.id,
        `odd bracket (${floatDown.matchPoints} pts), one player floats to next bracket`,
      );
    }

    const toPair = pool.filter((p) => p.id !== floatDown.id);
    const pairings = pairEvenPool(toPair, previousPairings, roundNumber, ctx);
    assert(
      pairings.length === toPair.length / 2,
      `Bracket pairing incomplete: expected ${
        toPair.length / 2
      } pairings, got ${pairings.length}`,
    );
    return { pairings, floatDown };
  }

  const pairings = pairEvenPool(pool, previousPairings, roundNumber, ctx);
  const expected = pool.length / 2;
  assert(
    pairings.length === expected,
    `Bracket pairing incomplete: expected ${expected} pairings, got ${pairings.length}`,
  );
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
    // Round 1: same byePriority as later rounds (lowest pts, fewest byes, then seed); everyone is 0 pts so order is by byes/id
    const byPriority = [...standings].sort(byePriority(`bye:r1`));
    const isOdd = byPriority.length % 2 === 1;
    let toPair = byPriority;
    let byePlayer: PlayerStanding | null = null;
    if (isOdd) {
      byePlayer = byPriority[0]!; // Bye to lowest score, fewest byes (first in asc order)
      const minPts = Math.min(...standings.map((s) => s.matchPoints));
      assert(
        byePlayer.matchPoints === minPts,
        `Bye selection bug: picked ${byePlayer.name} (${byePlayer.matchPoints}) but min points is ${minPts}`,
      );
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
    roundLevelInvariantCheck(out, standings, 1);
    return { pairings: out };
  }

  // Subsequent rounds: build score brackets from ALL players; do NOT remove a bye player up front.
  // Process brackets top-down. Only after the last bracket do we assign the bye to the single unpaired player (carryOver).
  const isOddTotal = standings.length % 2 === 1;
  let byePlayer: PlayerStanding | null = null;
  let byeReason = "";

  const floatReasons = new Map<string, string>();
  const groups = getScoreGroupsSorted(standings);
  const groupsMutable = groups.map((g) => ({
    points: g.points,
    players: [...g.players],
  }));
  let carryOver: PlayerStanding | null = null;

  const pairingHasRematch = (p: Pairing): boolean =>
    p.player2Id !== null &&
    havePlayedBefore(p.player1Id, p.player2Id, previousPairings);

  for (let i = 0; i < groupsMutable.length; i++) {
    const { players: groupPlayers } = groupsMutable[i]!;
    const isLastBracket = i === groupsMutable.length - 1;
    const hasNextGroup = i + 1 < groupsMutable.length;
    const nextGroup = hasNextGroup ? groupsMutable[i + 1]! : null;
    const currentPool =
      carryOver !== null ? [carryOver, ...groupPlayers] : [...groupPlayers];

    if (
      currentPool.length % 2 === 0 &&
      !isLastBracket &&
      nextGroup &&
      nextGroup.players.length >= 2
    ) {
      const trialResult = processBracket(
        currentPool,
        previousPairings,
        roundNumber,
        new Map(),
        false,
        carryOver?.id ?? null,
      );
      const hasRematch = trialResult.pairings.some(pairingHasRematch);
      if (hasRematch) {
        const floatUpCandidate = [...nextGroup.players].sort(
          byePriority(`floatup:r${roundNumber}`),
        )[0]!;
        nextGroup.players = nextGroup.players.filter(
          (p) => p.id !== floatUpCandidate.id,
        );
        const poolWithFloatUp = [...currentPool, floatUpCandidate];
        const floatDown = [...groupPlayers].sort(floatPriority)[0]!;
        const toPair = poolWithFloatUp.filter((p) => p.id !== floatDown.id);
        const ctx: PairingContext = {
          roundNumber,
          bracketPoints: [
            ...new Set(poolWithFloatUp.map((x) => x.matchPoints)),
          ].sort((a, b) => b - a),
          carryOverId: carryOver?.id ?? null,
          previousPairingsCount: previousPairings.length,
        };
        const repairPairings = pairEvenPool(
          toPair,
          previousPairings,
          roundNumber,
          ctx,
        );
        floatReasons.set(
          floatDown.id,
          `float down to avoid rematch; one from lower bracket floated up`,
        );
        floatReasons.set(
          floatUpCandidate.id,
          `floated up from ${floatUpCandidate.matchPoints} bracket to avoid rematch above`,
        );
        for (const p of repairPairings) {
          pairings.push(p);
        }
        carryOver = floatDown;
        continue;
      }
    }

    const result = processBracket(
      currentPool,
      previousPairings,
      roundNumber,
      floatReasons,
      isLastBracket,
      carryOver?.id ?? null,
    );
    for (const p of result.pairings) {
      pairings.push(p);
    }
    carryOver = result.floatDown;
  }

  // After processing all brackets: if total players is odd, exactly one player (carryOver) is unpaired — they get the bye.
  if (isOddTotal) {
    assert(
      carryOver !== null,
      "Odd total players but no unpaired player (carryOver) after bracket processing",
    );
    byePlayer = carryOver;
    const minPts = Math.min(...standings.map((s) => s.matchPoints));
    assert(
      byePlayer.matchPoints === minPts,
      `Bye selection bug: picked ${byePlayer.name} (${byePlayer.matchPoints}) but min points is ${minPts}`,
    );
    byeReason =
      "selected from lowest bracket after float resolution (bye priority: lowest pts, fewest byes)";
  } else {
    assert(
      carryOver === null,
      "Even total players but bracket processing left an unpaired floater",
    );
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

  assert(
    pairings.length === Math.ceil(standings.length / 2),
    "Incorrect total number of pairings generated",
  );

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
      `Max float distance: ${maxDownFloatUsed} points${
        maxDownFloatUsed > 1 ? " (multi-step)" : ""
      }`,
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

  roundLevelInvariantCheck(out, standings, roundNumber);

  const seenMatches = new Set<string>();
  const rematchesUnavoidable = usedRematch;
  const multiStepFloatsUnavoidable = maxDownFloatUsed > 1;

  for (const p of out) {
    const a = p.player1Id;
    const b = p.player2Id ?? "bye";
    const key =
      a < b ? `${a}|${b}|r${roundNumber}` : `${b}|${a}|r${roundNumber}`;
    if (seenMatches.has(key)) {
      throw new Error(
        `Duplicate match object detected: ${key} [roundNumber=${roundNumber}]`,
      );
    }
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
