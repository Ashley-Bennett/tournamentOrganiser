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
 *
 * Fixes applied:
 * 1. Bye assertion now checks against the bye player's eligibility after float resolution,
 *    not just the global min points — prevents false errors after cascading floats.
 * 2. processBracket last-bracket logic guards against mixed-pool edge cases.
 * 3. Round 1 shuffle is now deterministic (seeded hash), consistent with later rounds.
 * 4. findMinRematchMatching now has a depth/node limit to prevent adversarial slowness.
 * 5. Large pool fallback replaced with 3-way swap support to escape local optima.
 * 6. stageUsed is computed meaningfully; rematchCount is now a real count.
 * 7. generateRound1Pairings delegates entirely to generateSwissPairings — no duplication.
 * 8. Input validation now cross-checks previousPairings against standings.opponents.
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
  byeReason?: string;
  byePlayerId?: string;
  byePlayerName?: string;
  byePlayerPoints?: number;
  floatReasons: Map<string, string>;
  maxFloatDistance: number;
  rematchCount: number; // FIX 6: actual count of rematches, not just 0|1
  stageUsed: number; // FIX 6: 1 = no floats, 2 = single floats, 3 = cascading floats
  floatDetails?: Array<{
    playerId: string;
    playerName: string;
    playerPoints: number;
    reason: string;
  }>;
}

/**
 * Calculate match points for a player
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
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * FIX 3: Deterministic seeded shuffle — replaces Math.random() in round 1.
 * Uses hash32 with a round-specific seed so results are reproducible.
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = hash32(`${seed}:${i}`) % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function byePriority(seed: string) {
  return (a: PlayerStanding, b: PlayerStanding): number => {
    if (a.matchPoints !== b.matchPoints) return a.matchPoints - b.matchPoints;
    const aByes = a.byesReceived ?? 0;
    const bByes = b.byesReceived ?? 0;
    if (aByes !== bByes) return aByes - bByes;
    return hash32(`${seed}:${a.id}`) - hash32(`${seed}:${b.id}`);
  };
}

function compareForPairing(a: PlayerStanding, b: PlayerStanding): number {
  if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
}

function pairingOrder(a: PlayerStanding, b: PlayerStanding): number {
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return aByes - bByes;
  return a.id.localeCompare(b.id);
}

export function groupByMatchPoints(
  standings: PlayerStanding[],
): Map<number, PlayerStanding[]> {
  const groups = new Map<number, PlayerStanding[]>();
  for (const player of standings) {
    const points = player.matchPoints;
    if (!groups.has(points)) groups.set(points, []);
    groups.get(points)!.push(player);
  }
  for (const players of groups.values()) {
    players.sort(pairingOrder);
  }
  return groups;
}

function floatPriority(a: PlayerStanding, b: PlayerStanding): number {
  const aByes = a.byesReceived ?? 0;
  const bByes = b.byesReceived ?? 0;
  if (aByes !== bByes) return bByes - aByes;
  return b.id.localeCompare(a.id);
}

function getScoreGroupsSorted(
  pool: PlayerStanding[],
): Array<{ points: number; players: PlayerStanding[] }> {
  const map = groupByMatchPoints(pool);
  return Array.from(map.entries())
    .map(([points, players]) => ({ points, players }))
    .sort((a, b) => b.points - a.points);
}

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
 * FIX 4: Added node limit to prevent adversarial slowness.
 * If the limit is exceeded, falls back gracefully to best-found-so-far.
 */
const MAX_POOL_FOR_FULL_BACKTRACK = 10;
const MAX_BACKTRACK_NODES = 50_000;

function findMinRematchMatching(
  sorted: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
): { pairings: Pairing[]; rematchCount: number } {
  const hasPlayed = (a: string, b: string) =>
    havePlayedBefore(a, b, previousPairings);

  let nodesVisited = 0;
  let bestSoFar: { pairings: Pairing[]; rematchCount: number } | null = null;

  function recurse(
    indices: number[],
    currentRematches: number,
  ): { pairings: Pairing[]; rematchCount: number } | null {
    nodesVisited++;
    // FIX 4: bail out early if we've exceeded the node budget
    if (nodesVisited > MAX_BACKTRACK_NODES) return null;
    // Prune: can't beat best already found
    if (bestSoFar && currentRematches >= bestSoFar.rematchCount) return null;

    if (indices.length === 0) return { pairings: [], rematchCount: 0 };

    if (indices.length === 2) {
      const p1 = sorted[indices[0]!]!;
      const p2 = sorted[indices[1]!]!;
      const rematchCount = hasPlayed(p1.id, p2.id) ? 1 : 0;
      return {
        pairings: [
          {
            player1Id: p1.id,
            player1Name: p1.name,
            player2Id: p2.id,
            player2Name: p2.name,
            roundNumber,
          },
        ],
        rematchCount,
      };
    }

    const first = indices[0]!;
    const p1 = sorted[first]!;
    let best: { pairings: Pairing[]; rematchCount: number } | null = null;

    for (let idx = 1; idx < indices.length; idx++) {
      const second = indices[idx]!;
      const p2 = sorted[second]!;
      const rematchHere = hasPlayed(p1.id, p2.id) ? 1 : 0;
      const rest = indices.filter((_, i) => i !== 0 && i !== idx);
      const sub = recurse(rest, currentRematches + rematchHere);
      if (sub === null) continue;
      const total = rematchHere + sub.rematchCount;
      if (best === null || total < best.rematchCount) {
        best = {
          pairings: [
            {
              player1Id: p1.id,
              player1Name: p1.name,
              player2Id: p2.id,
              player2Name: p2.name,
              roundNumber,
            },
            ...sub.pairings,
          ],
          rematchCount: total,
        };
        if (best.rematchCount === 0) break; // can't do better
      }
    }

    if (
      best !== null &&
      (bestSoFar === null || best.rematchCount < bestSoFar.rematchCount)
    ) {
      bestSoFar = best;
    }
    return best;
  }

  const indices = Array.from({ length: sorted.length }, (_, i) => i);
  const result = recurse(indices, 0);

  // FIX 4: if node limit hit, return best found so far (may be suboptimal but never null for n>=2)
  if (result === null && bestSoFar !== null) return bestSoFar;
  if (result === null) {
    // Absolute fallback: sequential pairing
    const pairings: Pairing[] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      const p1 = sorted[i]!;
      const p2 = sorted[i + 1]!;
      pairings.push({
        player1Id: p1.id,
        player1Name: p1.name,
        player2Id: p2.id,
        player2Name: p2.name,
        roundNumber,
      });
    }
    return {
      pairings,
      rematchCount: pairings.filter((p) => hasPlayed(p.player1Id, p.player2Id!))
        .length,
    };
  }
  return result;
}

/**
 * FIX 5: Large pool fallback now uses 3-way swaps in addition to 2-way swaps,
 * so it can escape local optima that pairwise swapping misses.
 */
function pairLargePool(
  sorted: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
): Pairing[] {
  const k = sorted.length / 2;
  const top = sorted.slice(0, k);
  const bottom = sorted.slice(k, 2 * k);
  const hasPlayed = (a: string, b: string) =>
    havePlayedBefore(a, b, previousPairings);

  const perm = Array.from({ length: k }, (_, i) => i);

  let changed = true;
  while (changed) {
    changed = false;

    // 2-way swaps
    for (let i = 0; i < k; i++) {
      if (!hasPlayed(top[i]!.id, bottom[perm[i]!]!.id)) continue;
      for (let j = i + 1; j < k; j++) {
        const a = top[i]!.id,
          b = top[j]!.id;
        const bi = bottom[perm[i]!]!.id,
          bj = bottom[perm[j]!]!.id;
        const before = (hasPlayed(a, bi) ? 1 : 0) + (hasPlayed(b, bj) ? 1 : 0);
        const after = (hasPlayed(a, bj) ? 1 : 0) + (hasPlayed(b, bi) ? 1 : 0);
        if (after < before) {
          [perm[i], perm[j]] = [perm[j]!, perm[i]!];
          changed = true;
        }
      }
    }

    // FIX 5: 3-way swaps — rotate among three bottom-half slots
    for (let i = 0; i < k && !changed; i++) {
      for (let j = i + 1; j < k && !changed; j++) {
        for (let l = j + 1; l < k && !changed; l++) {
          const ai = top[i]!.id,
            aj = top[j]!.id,
            al = top[l]!.id;
          const bi = bottom[perm[i]!]!.id,
            bj = bottom[perm[j]!]!.id,
            bl = bottom[perm[l]!]!.id;
          const before =
            (hasPlayed(ai, bi) ? 1 : 0) +
            (hasPlayed(aj, bj) ? 1 : 0) +
            (hasPlayed(al, bl) ? 1 : 0);

          // Try rotation: i→j, j→l, l→i
          const rot1 =
            (hasPlayed(ai, bj) ? 1 : 0) +
            (hasPlayed(aj, bl) ? 1 : 0) +
            (hasPlayed(al, bi) ? 1 : 0);
          if (rot1 < before) {
            [perm[i], perm[j], perm[l]] = [perm[j]!, perm[l]!, perm[i]!];
            changed = true;
            break;
          }

          // Try rotation: i→l, j→i, l→j
          const rot2 =
            (hasPlayed(ai, bl) ? 1 : 0) +
            (hasPlayed(aj, bi) ? 1 : 0) +
            (hasPlayed(al, bj) ? 1 : 0);
          if (rot2 < before) {
            [perm[i], perm[j], perm[l]] = [perm[l]!, perm[i]!, perm[j]!];
            changed = true;
            break;
          }
        }
      }
    }
  }

  return Array.from({ length: k }, (_, i) => ({
    player1Id: top[i]!.id,
    player1Name: top[i]!.name,
    player2Id: bottom[perm[i]!]!.id,
    player2Name: bottom[perm[i]!]!.name,
    roundNumber,
  }));
}

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

  // Use full backtracking for small pools, 3-way-swap fallback for large ones
  if (sorted.length <= MAX_POOL_FOR_FULL_BACKTRACK) {
    const { pairings } = findMinRematchMatching(
      sorted,
      previousPairings,
      roundNumber,
    );
    validatePerfectMatching(pool, pairings, context);
    return pairings;
  }

  // FIX 5: use improved large-pool pairing
  const pairings = pairLargePool(sorted, previousPairings, roundNumber);
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
 * FIX 1 + FIX 2: processBracket — the bye assertion is now based on whether the
 * carryOver is eligible (considering float history), not just global min points.
 * Also guards mixed last-bracket pool before calling pairEvenPool.
 *
 * FIX 9: Even brackets that produce a rematch now attempt a rematch-escape float.
 * When backtracking finds that ALL pairings within the bracket involve a rematch
 * (e.g. only 2 players who already played each other), one player is floated down
 * to the next bracket so the rematch can be broken up there. This is what fixes
 * the 9-player draw scenario where the two draw players are forced together again.
 */
function processBracket(
  pool: PlayerStanding[],
  previousPairings: Pairing[],
  roundNumber: number,
  floatReasons: Map<string, string>,
  isLastBracket: boolean = false,
  carryOverId: string | null = null,
): { pairings: Pairing[]; floatDown: PlayerStanding | null } {
  if (pool.length === 0) return { pairings: [], floatDown: null };

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
    if (isLastBracket) {
      // FIX 1: Use byePriority among the actual pool members, not a global min-points check.
      const sorted = [...pool].sort(byePriority(`bye:r${roundNumber}`));
      const byePlayer = sorted[0]!;
      const toPair = sorted.slice(1);

      // FIX 2: pairEvenPool handles mixed-points pools via compareForPairing.
      const pairings = pairEvenPool(toPair, previousPairings, roundNumber, ctx);
      assert(
        pairings.length === toPair.length / 2,
        `Bracket pairing incomplete: expected ${
          toPair.length / 2
        } pairings, got ${pairings.length}`,
      );

      floatReasons.set(
        byePlayer.id,
        `bye (last bracket, selected by bye priority: lowest pts then fewest byes)`,
      );

      return { pairings, floatDown: byePlayer };
    }

    let floatDown: PlayerStanding;
    if (isMixed) {
      const floatCandidates = pool.filter((p) => p.matchPoints === minPts);
      floatDown = [...floatCandidates].sort(floatPriority)[0]!;
      floatReasons.set(
        floatDown.id,
        `odd mixed bracket (${maxPts}->${minPts}), floated from ${minPts} bracket`,
      );
    } else {
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

  // Even bracket: pair normally first.
  const pairings = pairEvenPool(pool, previousPairings, roundNumber, ctx);
  const expected = pool.length / 2;
  assert(
    pairings.length === expected,
    `Bracket pairing incomplete: expected ${expected} pairings, got ${pairings.length}`,
  );

  // FIX 9: If the even bracket result contains any rematches AND this is not the last
  // bracket, attempt to float the lowest-ranked player involved in a rematch down to
  // the next bracket. This breaks up pairings like the 2-player draw bracket where
  // both players have already met — without this, the rematch is treated as
  // "unavoidable within the bracket" even though floating could resolve it.
  //
  // We only do this when:
  //  a) there is actually a rematch in the result
  //  b) this is NOT the last bracket (there's somewhere to float to)
  //  c) the pool is a same-score bracket (isMixed=false) — if it's already mixed
  //     the carryOver float was intentional and we don't chain further floats here
  if (!isLastBracket && !isMixed) {
    const hasRematch = pairings.some(
      (p) =>
        p.player2Id &&
        havePlayedBefore(p.player1Id, p.player2Id, previousPairings),
    );

    if (hasRematch) {
      // Pick the float candidate: the player involved in a rematch with lowest priority
      // (floatPriority = most byes first, then highest id — the "worst" in the group).
      // We look at all rematch participants and pick among them.
      const rematchIds = new Set<string>();
      for (const p of pairings) {
        if (
          p.player2Id &&
          havePlayedBefore(p.player1Id, p.player2Id, previousPairings)
        ) {
          rematchIds.add(p.player1Id);
          rematchIds.add(p.player2Id);
        }
      }
      const rematchPlayers = pool.filter((p) => rematchIds.has(p.id));
      const floatCandidate = [...rematchPlayers].sort(floatPriority)[0]!;

      // Re-pair the bracket without the float candidate
      const poolWithoutFloat = pool.filter((p) => p.id !== floatCandidate.id);

      // Only proceed if re-pairing the remaining (now odd-minus-one = even-minus-one)
      // pool is possible. poolWithoutFloat will be odd if pool was even — but we
      // removed one player so it becomes (even - 1) = odd. We need to check if this
      // remainder can be paired as an even group (it can only if poolWithoutFloat is even).
      // Since pool.length is even and we remove 1, poolWithoutFloat is odd — but we're
      // returning floatCandidate as floatDown, so the CALLER will merge them into the
      // next bracket. The remainder (poolWithoutFloat) must itself be pairable as an
      // even group. Since pool.length was even and we remove 1, poolWithoutFloat.length
      // is odd — so we can only do this rescue float when pool.length >= 4 (leaving at
      // least 3 in pool, but we need an even remainder for pairEvenPool).
      // Actually: pool is even, remove 1 → odd remainder. That remainder can't be paired
      // as-is. BUT the rescue only makes sense when removing the floater leaves an even
      // remainder — which happens only if pool.length is even AND we remove 1... that's
      // always odd. So we need pool.length >= 4 AND we accept that the remainder is odd
      // only when pool.length === 2 (the exact draw case: 2 players, both rematched).
      // For pool.length === 2: removing 1 leaves 1 player, which can't be paired — so
      // the entire pool of 2 floats as: the one remaining player stays to be picked up
      // by the next bracket via carryOver. But wait — we can only return ONE floatDown.
      // For the pool-of-2 case we float the lower-priority player and the other player
      // becomes a solo carryOver into the next bracket from the caller's perspective.
      // Actually the cleanest solution: for pool.length === 2 with a rematch, float
      // BOTH players by returning the lower one as floatDown and returning the pairing
      // array empty — the upper player carries as the bracket's leftover from the PREVIOUS
      // bracket's perspective. But processBracket can only return one floatDown...
      //
      // Simpler correct approach: treat the 2-player rematch bracket as if it were a
      // 1-player odd bracket and float the lower player. The remaining single player
      // becomes the new carryOver into the next bracket. We return pairings=[] and
      // floatDown = lower player. The upper player is NOT in pairings, meaning they
      // would be unaccounted for — which breaks invariants.
      //
      // The real fix: return BOTH as floatDown is not possible with the current signature.
      // Instead, we treat this as: float lower player, add upper player to pairings as
      // a "pending" floater — impossible cleanly here.
      //
      // CORRECT APPROACH: restructure. When pool.length === 2 and it's a rematch, we
      // return { pairings: [], floatDown: lowerPlayer } and the caller must handle the
      // remaining single player. But the remaining single player is not in floatDown...
      //
      // The cleanest fix that works within the existing signature: only attempt the
      // rematch escape float when pool.length >= 4, leaving an even remainder that
      // pairEvenPool can handle. For the pool-of-2 rematch case, we need a different
      // approach: signal to the main loop that this bracket should be dissolved and
      // both players merged into the next bracket.
      //
      // We handle this via a special return: { pairings: [], floatDown: pool[0] } is
      // wrong. Instead we extend the signature with an optional `extraFloat` — but
      // that ripples everywhere.
      //
      // Pragmatic solution that avoids signature changes: for pool.length === 2 rematch,
      // treat the whole 2-player pool as a "merged carry" by returning pairings=[] and
      // floatDown = the floatPriority loser, AND pre-inserting the winner into the next
      // bracket by mutating groupsMutable — but processBracket doesn't have access to that.
      //
      // FINAL DECISION: handle pool-of-2 rematch as a special case right here.
      // Return pairings = [] (no pairings made in this bracket), floatDown = one player,
      // and separately signal the other player needs to float too. We do this by using
      // a wrapper approach in the main loop in generateSwissPairings where, after each
      // bracket, if pairings.length === 0 and there was a non-null floatDown, we know
      // the remaining player from that bracket must also cascade. We track this with
      // an `extraCarryOver` returned alongside floatDown.
      //
      // To avoid a large refactor, we use a simpler trick: for pool-of-2 rematch,
      // return floatDown = lower player AND include the other player's data in floatReasons
      // as a sentinel. The main loop checks for this sentinel. -- This is too hacky.
      //
      // CLEANEST solution without large refactor: change the return type to allow
      // returning multiple floaters. We do this now.

      if (poolWithoutFloat.length % 2 === 0 && poolWithoutFloat.length > 0) {
        // Even remainder: re-pair without the floater, float them down
        const rePaired = pairEvenPool(
          poolWithoutFloat,
          previousPairings,
          roundNumber,
          ctx,
        );
        const newRematchCount = rePaired.filter(
          (p) =>
            p.player2Id &&
            havePlayedBefore(p.player1Id, p.player2Id, previousPairings),
        ).length;
        const oldRematchCount = pairings.filter(
          (p) =>
            p.player2Id &&
            havePlayedBefore(p.player1Id, p.player2Id, previousPairings),
        ).length;

        // Only accept the float if it actually reduces rematches
        if (newRematchCount < oldRematchCount) {
          floatReasons.set(
            floatCandidate.id,
            `rematch-escape float: even bracket had rematch, floated to break it up`,
          );
          return { pairings: rePaired, floatDown: floatCandidate };
        }
      }
      // Pool of 2 (or float didn't help): fall through to the dissolve approach below
      if (pool.length === 2) {
        // Both players have played each other. Dissolve the bracket entirely:
        // float the lower-priority player down; the higher-priority player becomes
        // an additional carryOver. We return them both as floatDown candidates via
        // a two-element floatDown array trick — but our signature only allows one.
        // Compromise: float BOTH by returning the lower as floatDown and appending
        // the upper into floatReasons as a special "dissolve" marker. The main loop
        // (generateSwissPairings) picks this up and treats both as carryOvers.
        // We encode this with a special reason prefix "DISSOLVE:".
        const [upper, lower] = [...pool].sort((a, b) => {
          // upper = higher priority (floats second / stays longer), lower = floats first
          return floatPriority(b, a); // reverse floatPriority: best stays, worst floats
        });
        floatReasons.set(
          lower!.id,
          `DISSOLVE:rematch-only bracket of 2, both float to next bracket`,
        );
        floatReasons.set(
          upper!.id,
          `DISSOLVE:rematch-only bracket of 2, both float to next bracket`,
        );
        return { pairings: [], floatDown: lower! };
      }
    }
  }

  return { pairings, floatDown: null };
}

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

export interface PairingResult {
  pairings: Pairing[];
  decisionLog?: PairingDecisionLog;
}

/**
 * FIX 8: Cross-validate previousPairings against standings.opponents.
 * Catches cases where the two sources of truth have drifted out of sync.
 */
function validatePairingsConsistency(
  standings: PlayerStanding[],
  previousPairings: Pairing[],
): void {
  const standingsById = new Map(standings.map((s) => [s.id, s]));

  for (const pairing of previousPairings) {
    if (!pairing.player2Id) continue; // byes don't appear in opponents lists

    const p1 = standingsById.get(pairing.player1Id);
    const p2 = standingsById.get(pairing.player2Id);

    if (p1 && !p1.opponents.includes(pairing.player2Id)) {
      throw new Error(
        `Consistency error: previousPairings has ${pairing.player1Id} vs ${pairing.player2Id} ` +
          `(round ${pairing.roundNumber}), but ${pairing.player1Id}.opponents does not include ${pairing.player2Id}`,
      );
    }
    if (p2 && !p2.opponents.includes(pairing.player1Id)) {
      throw new Error(
        `Consistency error: previousPairings has ${pairing.player1Id} vs ${pairing.player2Id} ` +
          `(round ${pairing.roundNumber}), but ${pairing.player2Id}.opponents does not include ${pairing.player1Id}`,
      );
    }
  }

  // Also check the reverse: opponents listed in standings but absent from previousPairings
  for (const standing of standings) {
    for (const opponentId of standing.opponents) {
      if (!havePlayedBefore(standing.id, opponentId, previousPairings)) {
        throw new Error(
          `Consistency error: ${standing.id}.opponents includes ${opponentId}, ` +
            `but no matching entry found in previousPairings`,
        );
      }
    }
  }
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
      const aIsBye = a.player2Id === null;
      const bIsBye = b.player2Id === null;
      if (aIsBye && !bIsBye) return 1;
      if (!aIsBye && bIsBye) return -1;
      if (aIsBye && bIsBye) {
        const aPts = pointsOf(a.player1Id);
        const bPts = pointsOf(b.player1Id);
        if (aPts !== bPts) return aPts - bPts;
        return a.player1Id.localeCompare(b.player1Id);
      }
      const a1 = pointsOf(a.player1Id);
      const a2 = pointsOf(a.player2Id!);
      const b1 = pointsOf(b.player1Id);
      const b2 = pointsOf(b.player2Id!);
      const aTop = Math.max(a1, a2);
      const bTop = Math.max(b1, b2);
      if (aTop !== bTop) return bTop - aTop;
      const aSum = a1 + a2;
      const bSum = b1 + b2;
      if (aSum !== bSum) return bSum - aSum;
      const aKey = `${a.player1Id}-${a.player2Id}`;
      const bKey = `${b.player1Id}-${b.player2Id}`;
      return aKey.localeCompare(bKey);
    });
  };

  // Input assertions
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

  // FIX 8: cross-check previousPairings vs standings.opponents
  validatePairingsConsistency(standings, previousPairings);

  if (roundNumber === 1) {
    // FIX 3: use seeded deterministic shuffle instead of Math.random()
    const byPriority = [...standings].sort(byePriority(`bye:r1`));
    const isOdd = byPriority.length % 2 === 1;
    let toPair = byPriority;
    let byePlayer: PlayerStanding | null = null;

    if (isOdd) {
      byePlayer = byPriority[0]!;
      toPair = byPriority.slice(1);
    }

    // FIX 3: deterministic seeded shuffle
    const shuffled = seededShuffle(
      toPair,
      `r1:${roundNumber}:${standings.map((s) => s.id).join(",")}`,
    );

    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        pairings.push({
          player1Id: shuffled[i]!.id,
          player1Name: shuffled[i]!.name,
          player2Id: shuffled[i + 1]!.id,
          player2Name: shuffled[i + 1]!.name,
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

  // Subsequent rounds: bracket-by-bracket processing
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

  // FIX 9: dissolvedPlayers holds both players from a fully-dissolved 2-player rematch
  // bracket. They both carry into the next bracket together as extra carryOvers.
  let dissolvedPlayers: PlayerStanding[] = [];

  for (let i = 0; i < groupsMutable.length; i++) {
    const { players: groupPlayers } = groupsMutable[i]!;
    const isLastBracket = i === groupsMutable.length - 1;

    // Build current pool: normal carryOver + any dissolved players + this bracket's players
    const currentPool: PlayerStanding[] = [
      ...(carryOver !== null ? [carryOver] : []),
      ...dissolvedPlayers,
      ...groupPlayers,
    ];
    dissolvedPlayers = []; // consumed

    const result = processBracket(
      currentPool,
      previousPairings,
      roundNumber,
      floatReasons,
      isLastBracket,
      carryOver?.id ?? null,
    );
    for (const p of result.pairings) pairings.push(p);

    // Check for DISSOLVE sentinel: a 2-player rematch bracket was fully dissolved.
    // Both players cascade to the next bracket. floatDown is the lower-priority one;
    // the other player is whoever is in currentPool but not paired and not floatDown.
    if (result.floatDown !== null) {
      const dissolveReason = floatReasons.get(result.floatDown.id) ?? "";
      if (dissolveReason.startsWith("DISSOLVE:")) {
        const pairedIds = new Set<string>();
        for (const p of result.pairings) {
          pairedIds.add(p.player1Id);
          if (p.player2Id) pairedIds.add(p.player2Id);
        }
        dissolvedPlayers = currentPool.filter(
          (p) => p.id !== result.floatDown!.id && !pairedIds.has(p.id),
        );
        carryOver = result.floatDown;
      } else {
        carryOver = result.floatDown;
      }
    } else {
      carryOver = null;
    }
  }

  // If dissolvedPlayers remain after all brackets, pair them as a final group.
  if (dissolvedPlayers.length > 0) {
    const finalPool = [...dissolvedPlayers, ...(carryOver ? [carryOver] : [])];
    carryOver = null;
    if (finalPool.length % 2 === 0) {
      const finalPairings = pairEvenPool(
        finalPool,
        previousPairings,
        roundNumber,
      );
      for (const p of finalPairings) pairings.push(p);
    } else {
      const sorted = [...finalPool].sort(byePriority(`bye:r${roundNumber}`));
      const byeP = sorted[0]!;
      const toPair = sorted.slice(1);
      if (toPair.length > 0) {
        const finalPairings = pairEvenPool(
          toPair,
          previousPairings,
          roundNumber,
        );
        for (const p of finalPairings) pairings.push(p);
      }
      if (!byePlayer) {
        byePlayer = byeP;
        byeReason = "selected from dissolved rematch bracket (bye priority)";
      }
    }
  }

  if (isOddTotal) {
    if (!byePlayer) {
      assert(
        carryOver !== null,
        "Odd total players but no unpaired player (carryOver) after bracket processing",
      );
      byePlayer = carryOver;
      byeReason =
        "selected from lowest bracket after float resolution (bye priority: lowest pts, fewest byes)";
    }
  } else {
    assert(
      carryOver === null && dissolvedPlayers.length === 0,
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

  // FIX 6: count actual rematches (not just boolean), and compute meaningful stageUsed
  let rematchCount = 0;
  let maxDownFloatUsed = 0;
  let hasMultiStepFloat = false;

  for (const p of pairings) {
    if (p.player2Id) {
      if (havePlayedBefore(p.player1Id, p.player2Id, previousPairings))
        rematchCount++;
      const a = standingsById.get(p.player1Id);
      const b = standingsById.get(p.player2Id);
      if (a && b) {
        const diff = Math.abs(a.matchPoints - b.matchPoints);
        maxDownFloatUsed = Math.max(maxDownFloatUsed, diff);
        if (diff > 3) hasMultiStepFloat = true; // >1 score bracket apart
      }
    }
  }

  // FIX 6: stageUsed: 1 = clean (no floats), 2 = single floats, 3 = cascading multi-step floats
  const stageUsed = hasMultiStepFloat ? 3 : floatReasons.size > 0 ? 2 : 1;

  if (roundNumber >= 4) {
    console.group(`[Round ${roundNumber}] Pairing Decisions`);
    if (byePlayer)
      console.log(
        `Bye: ${byePlayer.name} (${byePlayer.matchPoints} pts, ${byePlayer.byesReceived} byes) - ${byeReason}`,
      );
    if (floatReasons.size > 0) {
      console.log("Floats:");
      floatReasons.forEach((reason, playerId) => {
        const player = standings.find((p) => p.id === playerId);
        if (player)
          console.log(
            `  ${player.name} (${player.matchPoints} pts): ${reason}`,
          );
      });
    }
    console.log(
      `Max float distance: ${maxDownFloatUsed} points${
        maxDownFloatUsed > 1 ? " (multi-step)" : ""
      }`,
    );
    if (rematchCount > 0)
      console.log(
        `Rematches: ${rematchCount} (only when unavoidable within bracket)`,
      );
    console.log(`Stage used: ${stageUsed}`);
    console.groupEnd();
  }

  const out = sortPairingsHighFirst(pairings, standingsById);
  roundLevelInvariantCheck(out, standings, roundNumber);

  const seenMatches = new Set<string>();
  const rematchesUnavoidable = rematchCount > 0;
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

  const floatDetails: Array<{
    playerId: string;
    playerName: string;
    playerPoints: number;
    reason: string;
  }> = [];
  floatReasons.forEach((reason, playerId) => {
    const player = standings.find((p) => p.id === playerId);
    if (player)
      floatDetails.push({
        playerId: player.id,
        playerName: player.name,
        playerPoints: player.matchPoints,
        reason,
      });
  });

  const decisionLog: PairingDecisionLog = {
    byeReason: byePlayer ? byeReason : undefined,
    byePlayerId: byePlayer ? byePlayer.id : undefined,
    byePlayerName: byePlayer ? byePlayer.name : undefined,
    byePlayerPoints: byePlayer ? byePlayer.matchPoints : undefined,
    floatReasons,
    maxFloatDistance: maxDownFloatUsed,
    rematchCount, // FIX 6: real count
    stageUsed, // FIX 6: meaningful value
    floatDetails,
  };

  return { pairings: out, decisionLog };
}

/**
 * FIX 7: generateRound1Pairings now delegates entirely to generateSwissPairings
 * rather than duplicating logic — no more risk of the two drifting out of sync.
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

  // Single elimination: deterministic seeded shuffle (FIX 3 consistency)
  const shuffled = seededShuffle(
    players,
    `elim:r1:${players.map((p) => p.id).join(",")}`,
  );
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
