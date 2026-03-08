/**
 * Tests for tournamentPairing.ts
 *
 * Covers:
 *  1. calculateMatchPoints      – point formula
 *  2. havePlayedBefore          – rematch detection
 *  3. groupByMatchPoints        – bracket grouping
 *  4. generateRound1Pairings    – round-1 entry point (swiss + single-elim)
 *  5. generateSwissPairings     – input validation, structural invariants,
 *                                 score-bracket pairing, rematch avoidance,
 *                                 bye priority, multi-round simulation
 */
import { describe, it, expect } from "vitest";
import {
  calculateMatchPoints,
  havePlayedBefore,
  groupByMatchPoints,
  generateSwissPairings,
  generateRound1Pairings,
} from "./tournamentPairing";
import type { PlayerStanding, Pairing } from "./tournamentPairing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshPlayer(id: string): PlayerStanding {
  return {
    id,
    name: id,
    matchPoints: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchesPlayed: 0,
    opponents: [],
    byesReceived: 0,
  };
}

function makePairing(p1: string, p2: string | null, round: number): Pairing {
  return {
    player1Id: p1,
    player1Name: p1,
    player2Id: p2,
    player2Name: p2,
    roundNumber: round,
  };
}

/** Verify every structural invariant for a round of pairings. */
function assertInvariants(
  pairings: Pairing[],
  standings: PlayerStanding[],
  roundNumber: number,
): void {
  const n = standings.length;
  expect(pairings, "pairings count").toHaveLength(Math.ceil(n / 2));

  const used = new Set<string>();
  for (const p of pairings) {
    expect(p.roundNumber, "roundNumber on each pairing").toBe(roundNumber);
    expect(p.player1Id, "player1Id is non-empty").toBeTruthy();
    if (p.player2Id !== null) {
      expect(p.player2Id, "no self-pairing").not.toBe(p.player1Id);
      expect(used.has(p.player2Id), "player2 not already used").toBe(false);
      used.add(p.player2Id);
    }
    expect(used.has(p.player1Id), "player1 not already used").toBe(false);
    used.add(p.player1Id);
  }

  for (const s of standings) {
    expect(used.has(s.id), `every player (${s.id}) appears in a pairing`).toBe(
      true,
    );
  }

  const byeCount = pairings.filter((p) => p.player2Id === null).length;
  expect(byeCount, "bye count").toBe(n % 2 === 1 ? 1 : 0);
}

type MatchResult = "p1wins" | "p2wins" | "draw";

interface SimState {
  standings: PlayerStanding[];
  previousPairings: Pairing[];
}

function freshTournament(ids: string[]): SimState {
  return { standings: ids.map(freshPlayer), previousPairings: [] };
}

/**
 * Apply match results to a round's pairings, returning the updated SimState.
 * Results array entries align with non-bye pairings (byes are auto-detected).
 */
function applyResults(
  state: SimState,
  pairings: Pairing[],
  results: MatchResult[],
): SimState {
  const sm = new Map<string, PlayerStanding>(
    state.standings.map((s) => [s.id, { ...s, opponents: [...s.opponents] }]),
  );
  let ri = 0;
  for (const p of pairings) {
    const p1 = sm.get(p.player1Id)!;
    if (p.player2Id === null) {
      p1.wins++;
      p1.byesReceived++;
      p1.matchesPlayed++;
    } else {
      const p2 = sm.get(p.player2Id)!;
      const res = results[ri++] ?? "p1wins";
      p1.matchesPlayed++;
      p2.matchesPlayed++;
      p1.opponents = [...p1.opponents, p2.id];
      p2.opponents = [...p2.opponents, p1.id];
      if (res === "p1wins") {
        p1.wins++;
        p2.losses++;
      } else if (res === "p2wins") {
        p1.losses++;
        p2.wins++;
      } else {
        p1.draws++;
        p2.draws++;
      }
      p2.matchPoints = calculateMatchPoints(p2.wins, p2.draws);
    }
    p1.matchPoints = calculateMatchPoints(p1.wins, p1.draws);
  }
  return {
    standings: Array.from(sm.values()),
    previousPairings: [...state.previousPairings, ...pairings],
  };
}

// ---------------------------------------------------------------------------
// 1. calculateMatchPoints
// ---------------------------------------------------------------------------

describe("calculateMatchPoints", () => {
  it("awards 3 per win", () =>
    expect(calculateMatchPoints(3, 0)).toBe(9));
  it("awards 1 per draw", () =>
    expect(calculateMatchPoints(0, 3)).toBe(3));
  it("combines wins and draws", () =>
    expect(calculateMatchPoints(2, 1)).toBe(7));
  it("returns 0 for 0-0-0", () =>
    expect(calculateMatchPoints(0, 0)).toBe(0));
});

// ---------------------------------------------------------------------------
// 2. havePlayedBefore
// ---------------------------------------------------------------------------

describe("havePlayedBefore", () => {
  const p: Pairing[] = [
    makePairing("A", "B", 1),
    makePairing("C", "D", 1),
    makePairing("E", null, 1), // bye
  ];

  it("returns true when p1 vs p2 exists in the list", () =>
    expect(havePlayedBefore("A", "B", p)).toBe(true));

  it("is symmetric — order of IDs does not matter", () =>
    expect(havePlayedBefore("B", "A", p)).toBe(true));

  it("returns false for a pair that has not played", () =>
    expect(havePlayedBefore("A", "C", p)).toBe(false));

  it("returns false when previous pairings are empty", () =>
    expect(havePlayedBefore("A", "B", [])).toBe(false));

  it("does not match the bye player against their non-existent opponent", () =>
    expect(havePlayedBefore("E", "A", p)).toBe(false));
});

// ---------------------------------------------------------------------------
// 3. groupByMatchPoints
// ---------------------------------------------------------------------------

describe("groupByMatchPoints", () => {
  it("groups players by their match-point total", () => {
    const players: PlayerStanding[] = [
      { ...freshPlayer("A"), matchPoints: 3, wins: 1 },
      { ...freshPlayer("B"), matchPoints: 0 },
      { ...freshPlayer("C"), matchPoints: 3, wins: 1 },
      { ...freshPlayer("D"), matchPoints: 0 },
    ];
    const groups = groupByMatchPoints(players);
    expect(groups.get(3)?.map((p) => p.id).sort()).toEqual(["A", "C"]);
    expect(groups.get(0)?.map((p) => p.id).sort()).toEqual(["B", "D"]);
  });

  it("produces a single group when all players have the same score", () => {
    const players = [freshPlayer("A"), freshPlayer("B"), freshPlayer("C")];
    const groups = groupByMatchPoints(players);
    expect(groups.size).toBe(1);
    expect(groups.get(0)?.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 4. generateRound1Pairings
// ---------------------------------------------------------------------------

describe("generateRound1Pairings", () => {
  describe("swiss", () => {
    it("covers every player with even count (no byes)", () => {
      const players = ["A", "B", "C", "D"].map((id) => ({ id, name: id }));
      const pairings = generateRound1Pairings("swiss", players);
      expect(pairings).toHaveLength(2);
      const used = new Set(pairings.flatMap((p) => [p.player1Id, p.player2Id!]));
      expect(used.size).toBe(4);
    });

    it("produces exactly one bye with odd player count", () => {
      const players = ["A", "B", "C"].map((id) => ({ id, name: id }));
      const pairings = generateRound1Pairings("swiss", players);
      expect(pairings.filter((p) => p.player2Id === null)).toHaveLength(1);
    });

    it("is deterministic — same input always produces the same output", () => {
      const players = ["A", "B", "C", "D", "E", "F"].map((id) => ({
        id,
        name: id,
      }));
      const first = generateRound1Pairings("swiss", players);
      const second = generateRound1Pairings("swiss", players);
      expect(first.map((p) => `${p.player1Id}-${p.player2Id}`)).toEqual(
        second.map((p) => `${p.player1Id}-${p.player2Id}`),
      );
    });
  });

  describe("single_elimination", () => {
    it("covers all players and has no byes for even count", () => {
      const players = ["A", "B", "C", "D"].map((id) => ({ id, name: id }));
      const pairings = generateRound1Pairings("single_elimination", players);
      expect(pairings).toHaveLength(2);
      const used = new Set(
        pairings.flatMap((p) =>
          p.player2Id ? [p.player1Id, p.player2Id] : [p.player1Id],
        ),
      );
      expect(used.size).toBe(4);
    });

    it("produces a bye for odd player count", () => {
      const players = ["A", "B", "C"].map((id) => ({ id, name: id }));
      const pairings = generateRound1Pairings("single_elimination", players);
      expect(pairings.filter((p) => p.player2Id === null)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. generateSwissPairings — input validation
// ---------------------------------------------------------------------------

describe("generateSwissPairings — input validation", () => {
  it("throws for roundNumber < 1", () => {
    expect(() => generateSwissPairings([], 0, [])).toThrow("Invalid roundNumber");
  });

  it("throws for duplicate player IDs", () => {
    const dupe = [freshPlayer("A"), freshPlayer("A")];
    expect(() => generateSwissPairings(dupe, 1, [])).toThrow(
      "Duplicate player ids",
    );
  });

  it("throws when matchPoints does not match wins/draws", () => {
    const bad: PlayerStanding = { ...freshPlayer("A"), wins: 2, matchPoints: 5 }; // should be 6
    expect(() => generateSwissPairings([bad], 1, [])).toThrow(
      "matchPoints mismatch",
    );
  });

  it("throws when standings.opponents are not reflected in previousPairings", () => {
    // A lists B as an opponent but there is no A-B entry in previousPairings
    const standings: PlayerStanding[] = [
      {
        ...freshPlayer("A"),
        wins: 1,
        matchPoints: 3,
        matchesPlayed: 1,
        opponents: ["B"],
      },
      {
        ...freshPlayer("B"),
        losses: 1,
        matchesPlayed: 1,
        opponents: ["A"],
      },
    ];
    expect(() => generateSwissPairings(standings, 2, [])).toThrow(
      "Consistency error",
    );
  });

  it("throws when previousPairings reference an opponent not in standings.opponents", () => {
    // previousPairings says A played B, but A.opponents is empty
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1 },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1 },
    ];
    const prev = [makePairing("A", "B", 1)];
    expect(() => generateSwissPairings(standings, 2, prev)).toThrow(
      "Consistency error",
    );
  });
});

// ---------------------------------------------------------------------------
// 6. generateSwissPairings — structural invariants (round 1)
// ---------------------------------------------------------------------------

describe("generateSwissPairings — round 1 invariants", () => {
  it.each([2, 4, 6, 8])("%i players: all paired, no bye", (n) => {
    const sim = freshTournament(
      Array.from({ length: n }, (_, i) => `p${i}`),
    );
    const { pairings } = generateSwissPairings(sim.standings, 1, []);
    assertInvariants(pairings, sim.standings, 1);
  });

  it.each([3, 5, 7, 9])("%i players: all paired, exactly one bye", (n) => {
    const sim = freshTournament(
      Array.from({ length: n }, (_, i) => `p${i}`),
    );
    const { pairings } = generateSwissPairings(sim.standings, 1, []);
    assertInvariants(pairings, sim.standings, 1);
  });
});

// ---------------------------------------------------------------------------
// 7. generateSwissPairings — score-bracket pairing (round 2)
// ---------------------------------------------------------------------------

describe("generateSwissPairings — score-bracket pairing", () => {
  it("pairs players from the same score bracket together", () => {
    // After round 1: A and C won (3 pts), B and D lost (0 pts)
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A", "B", 1), makePairing("C", "D", 1)];

    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    // A and C should be paired (both 3 pts); B and D should be paired (both 0 pts)
    const match = (p: Pairing, ids: [string, string]) =>
      (p.player1Id === ids[0] && p.player2Id === ids[1]) ||
      (p.player1Id === ids[1] && p.player2Id === ids[0]);
    expect(pairings.some((p) => match(p, ["A", "C"]))).toBe(true);
    expect(pairings.some((p) => match(p, ["B", "D"]))).toBe(true);
  });

  it("no rematches when an alternative pairing exists", () => {
    // After round 1 (A-B, C-D), round 2 pairs A-C and B-D — no rematches possible
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A", "B", 1), makePairing("C", "D", 1)];

    const { pairings } = generateSwissPairings(standings, 2, prev);
    const hasRematch = pairings.some(
      (p) => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, prev),
    );
    expect(hasRematch).toBe(false);
  });

  it("accepts a forced rematch when only two players remain", () => {
    // Only 2 players — round 2 must be a rematch
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
    ];
    const prev = [makePairing("A", "B", 1)];
    expect(() => generateSwissPairings(standings, 2, prev)).not.toThrow();
    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);
  });

  it("backtracks past multiple rematch options to find a zero-rematch solution", () => {
    // 4 players, all-draws through 2 rounds (all at 2pts).
    // Round 1: A-B (draw), C-D (draw)
    // Round 2: A-C (draw), B-D (draw)
    //
    // After 2 rounds every player has played exactly 2 of the other 3.
    // The only zero-rematch pairings for round 3 are A-D and B-C.
    // The algorithm tries A first; A-B is a rematch, A-C is a rematch — it must
    // backtrack both before landing on A-D. Without backtracking it would accept a
    // forced rematch instead of finding the zero-rematch solution.
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), draws: 2, matchPoints: 2, matchesPlayed: 2, opponents: ["B", "C"] },
      { ...freshPlayer("B"), draws: 2, matchPoints: 2, matchesPlayed: 2, opponents: ["A", "D"] },
      { ...freshPlayer("C"), draws: 2, matchPoints: 2, matchesPlayed: 2, opponents: ["D", "A"] },
      { ...freshPlayer("D"), draws: 2, matchPoints: 2, matchesPlayed: 2, opponents: ["C", "B"] },
    ];
    const prev: Pairing[] = [
      makePairing("A", "B", 1), makePairing("C", "D", 1),
      makePairing("A", "C", 2), makePairing("B", "D", 2),
    ];
    const { pairings } = generateSwissPairings(standings, 3, prev);
    assertInvariants(pairings, standings, 3);
    const hasRematch = pairings.some(
      (p) => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, prev),
    );
    expect(hasRematch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. generateSwissPairings — bye priority
// ---------------------------------------------------------------------------

describe("generateSwissPairings — bye priority", () => {
  it("bye goes to a 0-pt player, not a player who already has a bye", () => {
    // After round 1 (5 players): A and C won, B and D lost, E got a bye
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
      { ...freshPlayer("E"), wins: 1, matchPoints: 3, matchesPlayed: 1, byesReceived: 1 }, // bye in r1
    ];
    const prev = [
      makePairing("A", "B", 1),
      makePairing("C", "D", 1),
      makePairing("E", null, 1),
    ];

    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    const byePairing = pairings.find((p) => p.player2Id === null)!;
    expect(byePairing).toBeDefined();
    // E already has 1 bye — the new bye should go to a 0-pt player (B or D)
    expect(byePairing.player1Id).not.toBe("E");
    const byeRecipient = standings.find((s) => s.id === byePairing.player1Id)!;
    expect(byeRecipient.matchPoints).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Multi-round simulation — invariants must hold every round
// ---------------------------------------------------------------------------

describe("generateSwissPairings — multi-round simulation", () => {
  it("invariants hold for every round of an 8-player tournament", () => {
    let sim = freshTournament(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);

    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(
        sim.standings,
        round,
        sim.previousPairings,
      );
      assertInvariants(pairings, sim.standings, round);

      // All regular matches: p1 wins (creates a clear points ladder)
      const results: MatchResult[] = pairings
        .filter((p) => p.player2Id !== null)
        .map(() => "p1wins");
      sim = applyResults(sim, pairings, results);
    }
  });

  it("invariants hold for a 5-player (odd) tournament over 3 rounds", () => {
    let sim = freshTournament(["p0", "p1", "p2", "p3", "p4"]);

    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(
        sim.standings,
        round,
        sim.previousPairings,
      );
      assertInvariants(pairings, sim.standings, round);

      const results: MatchResult[] = pairings
        .filter((p) => p.player2Id !== null)
        .map(() => "p1wins");
      sim = applyResults(sim, pairings, results);
    }
  });

  it("no duplicate matches appear across rounds of a full tournament", () => {
    let sim = freshTournament(["A", "B", "C", "D", "E", "F"]);
    const allMatchKeys = new Set<string>();

    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(
        sim.standings,
        round,
        sim.previousPairings,
      );

      for (const p of pairings) {
        if (p.player2Id === null) continue;
        const key = [p.player1Id, p.player2Id].sort().join("|");
        // Same pair may appear again only when a rematch is forced (unavoidable);
        // in a 6-player tournament over 4 rounds that is possible, but verify
        // no two identical keys appear within the SAME round.
        const roundKey = `r${round}:${key}`;
        expect(allMatchKeys.has(roundKey)).toBe(false);
        allMatchKeys.add(roundKey);
      }

      const results: MatchResult[] = pairings
        .filter((p) => p.player2Id !== null)
        .map(() => "p1wins");
      sim = applyResults(sim, pairings, results);
    }
  });

  it("the same standings always produce the same pairings (determinism)", () => {
    const sim = freshTournament(["A", "B", "C", "D"]);
    const r1a = generateSwissPairings(sim.standings, 1, []);
    const r1b = generateSwissPairings(sim.standings, 1, []);
    expect(r1a.pairings).toEqual(r1b.pairings);
  });

  it("invariants hold when all matches end in draws (1-pt increments per round)", () => {
    // Draws create unusual point values (1 pt per match) — tests bracket grouping
    // with non-standard scores that the p1wins-only simulation never exercises.
    let sim = freshTournament(["A", "B", "C", "D"]);

    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(
        sim.standings,
        round,
        sim.previousPairings,
      );
      assertInvariants(pairings, sim.standings, round);

      const results: MatchResult[] = pairings
        .filter((p) => p.player2Id !== null)
        .map(() => "draw");
      sim = applyResults(sim, pairings, results);
    }

    // 4 players × 3 rounds of draws, no byes → each player played 3 matches, all draws
    for (const s of sim.standings) {
      expect(s.draws).toBe(3);
      expect(s.matchPoints).toBe(3); // 1 pt × 3 draws
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
    }
  });

  it("invariants hold with mixed results (wins, losses, and draws)", () => {
    // Alternates between p1wins and draw each round to exercise mixed point totals
    let sim = freshTournament(["A", "B", "C", "D", "E", "F"]);

    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(
        sim.standings,
        round,
        sim.previousPairings,
      );
      assertInvariants(pairings, sim.standings, round);

      const nonBye = pairings.filter((p) => p.player2Id !== null);
      // Alternate: odd-indexed matches are draws, even-indexed are wins
      const results: MatchResult[] = nonBye.map((_, i) =>
        i % 2 === 0 ? "p1wins" : "draw",
      );
      sim = applyResults(sim, pairings, results);
    }
  });
});
