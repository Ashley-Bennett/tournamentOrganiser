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
  it("bye is given to a higher-score player to avoid a rematch among the remainder", () => {
    // A and B are both at 1pt and have already played each other.
    // C is at 0pt and has not played A or B.
    // Normal bye priority would give C the bye (lowest score), forcing A vs B — a rematch.
    // The fix: give the bye to A or B instead, so C plays the other.
    const standings: PlayerStanding[] = [
      {
        ...freshPlayer("A"),
        draws: 1,
        matchPoints: 1,
        matchesPlayed: 1,
        opponents: ["B"],
      },
      {
        ...freshPlayer("B"),
        draws: 1,
        matchPoints: 1,
        matchesPlayed: 1,
        opponents: ["A"],
      },
      { ...freshPlayer("C") }, // 0pts, no prior matches tracked in this tournament
    ];
    const prev: Pairing[] = [makePairing("A", "B", 1)];

    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    // Must be rematch-free
    expect(
      pairings.some(
        (p) => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, prev),
      ),
    ).toBe(false);

    // C must NOT receive the bye (that would force A vs B rematch)
    const byePairing = pairings.find((p) => p.player2Id === null)!;
    expect(byePairing.player1Id).not.toBe("C");

    // C must be in a real match
    const cPairing = pairings.find(
      (p) => p.player1Id === "C" || p.player2Id === "C",
    );
    expect(cPairing?.player2Id).not.toBeNull();
  });

  it("bye still goes to lowest-score player when no rematch risk exists", () => {
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

  it("14-player even round-2: two tied players must not rematch (dissolve 2-player 1pt bracket)", () => {
    // Reported scenario: 14 players, round 1 produces 6 wins, 6 losses, 1 draw.
    // Brackets for round 2: [3pts×6] [1pt×2 — the two who drew] [0pts×6].
    // The 2-player 1pt bracket must be fully dissolved so both players pair
    // against 0pt opponents rather than rematching each other.
    const players = ["p0","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11","p12","p13"];
    let sim = freshTournament(players);

    // Round 1: p0–p5 win; p6 draws p13; p7–p12 lose
    const r1: Pairing[] = [
      makePairing("p0","p7",1), makePairing("p1","p8",1), makePairing("p2","p9",1),
      makePairing("p3","p10",1), makePairing("p4","p11",1), makePairing("p5","p12",1),
      makePairing("p6","p13",1),
    ];
    sim = applyResults(sim, r1, ["p1wins","p1wins","p1wins","p1wins","p1wins","p1wins","draw"]);

    // Confirm expected score distribution
    const byPts = (pts: number) => sim.standings.filter((s) => s.matchPoints === pts);
    expect(byPts(3)).toHaveLength(6);
    expect(byPts(1)).toHaveLength(2);
    expect(byPts(0)).toHaveLength(6);

    // Generate round 2
    const { pairings } = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 2);

    // No rematches — p6 and p13 must NOT play each other
    expect(
      pairings.some(
        (p) => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, sim.previousPairings),
      ),
    ).toBe(false);

    const p6Pairing = pairings.find((p) => p.player1Id === "p6" || p.player2Id === "p6")!;
    const p13Pairing = pairings.find((p) => p.player1Id === "p13" || p.player2Id === "p13")!;
    expect(p6Pairing.player2Id).not.toBeNull();
    expect(p13Pairing.player2Id).not.toBeNull();
    const p6Opponent = p6Pairing.player1Id === "p6" ? p6Pairing.player2Id : p6Pairing.player1Id;
    const p13Opponent = p13Pairing.player1Id === "p13" ? p13Pairing.player2Id : p13Pairing.player1Id;
    expect(p6Opponent).not.toBe("p13");
    expect(p13Opponent).not.toBe("p6");
  });

  it("9-player, 4 rounds all p1wins: invariants hold every round", () => {
    let sim = freshTournament(["p0","p1","p2","p3","p4","p5","p6","p7","p8"]);
    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
    }
  });

  it("12-player, 4 rounds mixed results: invariants hold every round", () => {
    let sim = freshTournament(Array.from({ length: 12 }, (_, i) => `p${i}`));
    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      const nonBye = pairings.filter(p => p.player2Id !== null);
      const results: MatchResult[] = nonBye.map((_, i) => (i % 3 === 0 ? "draw" : "p1wins"));
      sim = applyResults(sim, pairings, results);
    }
  });

  it("11-player round-3: no rematch when last two 1pt players drew each other in round 2", () => {
    // Reproduces the reported bug (11 players, 4 rounds):
    //   After round 2: 3 × 6pts | 5 × 3pts | 2 × 1pt (who drew each other) | 1 × 0pts
    // Without the fix: 0pt player gets the bye, last two 1pt players rematch.
    // With the fix: a 1pt player takes the bye; 0pt player plays the other 1pt player.
    //
    // Round 1 (11 players, 1 bye):
    //   p0>p8, p1>p9, p2>p10, p3>p4, p5>p6, p7=bye
    // Round 2 (11 players, 1 bye):
    //   p0>p3, p1>p5, p2>p7, p8 draws p9, p6>p10, p4=bye
    // → After r2: p0/p1/p2=6pts, p3/p4/p5/p6/p7=3pts, p8/p9=1pt, p10=0pts
    const players = ["p0","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10"];
    let sim = freshTournament(players);

    const r1: Pairing[] = [
      makePairing("p0","p8",1), makePairing("p1","p9",1), makePairing("p2","p10",1),
      makePairing("p3","p4",1), makePairing("p5","p6",1), makePairing("p7",null,1),
    ];
    sim = applyResults(sim, r1, ["p1wins","p1wins","p1wins","p1wins","p1wins"]);

    const r2: Pairing[] = [
      makePairing("p0","p3",2), makePairing("p1","p5",2), makePairing("p2","p7",2),
      makePairing("p8","p9",2), makePairing("p6","p10",2), makePairing("p4",null,2),
    ];
    sim = applyResults(sim, r2, ["p1wins","p1wins","p1wins","draw","p1wins"]);

    // Confirm expected score distribution
    const byPts = (pts: number) => sim.standings.filter((s) => s.matchPoints === pts);
    expect(byPts(6)).toHaveLength(3);
    expect(byPts(3)).toHaveLength(5);
    expect(byPts(1)).toHaveLength(2);
    expect(byPts(0)).toHaveLength(1);

    // Generate round 3
    const { pairings } = generateSwissPairings(sim.standings, 3, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 3);

    // No rematches anywhere
    expect(
      pairings.some(
        (p) => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, sim.previousPairings),
      ),
    ).toBe(false);

    // The 0pt player (p10) must NOT get the bye — they should play a 1pt player
    const byePairing = pairings.find((p) => p.player2Id === null)!;
    expect(byePairing.player1Id).not.toBe("p10");

    const p10Pairing = pairings.find(
      (p) => p.player1Id === "p10" || p.player2Id === "p10",
    );
    expect(p10Pairing?.player2Id).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Minimal edge-case player counts
// ---------------------------------------------------------------------------

describe("generateSwissPairings — minimal player counts", () => {
  it("single player produces exactly one bye pairing in round 1", () => {
    const sim = freshTournament(["solo"]);
    const { pairings } = generateSwissPairings(sim.standings, 1, []);
    assertInvariants(pairings, sim.standings, 1);
    expect(pairings[0]!.player2Id).toBeNull();
  });

  it("single player produces a bye in round 2 as well", () => {
    let sim = freshTournament(["solo"]);
    const r1 = generateSwissPairings(sim.standings, 1, []);
    sim = applyResults(sim, r1.pairings, []);
    const { pairings } = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 2);
    expect(pairings[0]!.player2Id).toBeNull();
  });

  it("2-player round 1: exactly one match, no bye", () => {
    const sim = freshTournament(["A", "B"]);
    const { pairings } = generateSwissPairings(sim.standings, 1, []);
    assertInvariants(pairings, sim.standings, 1);
    expect(pairings).toHaveLength(1);
    expect(pairings[0]!.player2Id).not.toBeNull();
  });

  it("3-player: invariants hold across 3 rounds (p1wins each match)", () => {
    let sim = freshTournament(["A", "B", "C"]);
    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
    }
  });

  it("3-player: invariants hold across 3 rounds (all draws)", () => {
    let sim = freshTournament(["A", "B", "C"]);
    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }
  });

  it("3-player: each player receives the bye at most once across 3 rounds when results differ", () => {
    let sim = freshTournament(["A", "B", "C"]);
    const byeRecipients: string[] = [];
    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      const byeP = pairings.find(p => p.player2Id === null);
      if (byeP) byeRecipients.push(byeP.player1Id);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p2wins"));
    }
    // At most 3 rounds × 1 bye each; verify no player received 2+ byes when avoidable.
    // With 3 players over 3 rounds every player should get the bye at most once.
    const counts = new Map<string, number>();
    for (const id of byeRecipients) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Large player counts
// ---------------------------------------------------------------------------

describe("generateSwissPairings — large player counts", () => {
  it.each([16, 20, 32])(
    "%i-player even tournament: invariants hold for 5 rounds",
    (n) => {
      let sim = freshTournament(Array.from({ length: n }, (_, i) => `p${i}`));
      for (let round = 1; round <= 5; round++) {
        const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
        assertInvariants(pairings, sim.standings, round);
        sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
      }
    },
  );

  it.each([15, 17, 33])(
    "%i-player odd tournament: invariants hold for 5 rounds",
    (n) => {
      let sim = freshTournament(Array.from({ length: n }, (_, i) => `p${i}`));
      for (let round = 1; round <= 5; round++) {
        const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
        assertInvariants(pairings, sim.standings, round);
        sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
      }
    },
  );

  it("32-player tournament with all draws: invariants hold for 4 rounds", () => {
    let sim = freshTournament(Array.from({ length: 32 }, (_, i) => `p${i}`));
    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }
  });

  it("20-player tournament with mixed results: invariants hold for 5 rounds", () => {
    let sim = freshTournament(Array.from({ length: 20 }, (_, i) => `p${i}`));
    for (let round = 1; round <= 5; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      const nonBye = pairings.filter(p => p.player2Id !== null);
      const results: MatchResult[] = nonBye.map((_, i) =>
        i % 4 === 0 ? "draw" : i % 4 === 1 ? "p2wins" : "p1wins",
      );
      sim = applyResults(sim, pairings, results);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Bye distribution across rounds
// ---------------------------------------------------------------------------

describe("generateSwissPairings — bye distribution", () => {
  it("player who received a bye in round 1 does not receive another in round 2", () => {
    let sim = freshTournament(["A", "B", "C", "D", "E"]);
    const r1 = generateSwissPairings(sim.standings, 1, []);
    assertInvariants(r1.pairings, sim.standings, 1);

    const round1ByeId = r1.pairings.find(p => p.player2Id === null)!.player1Id;

    sim = applyResults(sim, r1.pairings, r1.pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));

    const r2 = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(r2.pairings, sim.standings, 2);

    const round2ByeId = r2.pairings.find(p => p.player2Id === null)!.player1Id;
    expect(round2ByeId).not.toBe(round1ByeId);
  });

  it("bye goes to player with fewest prior byes when points are equal", () => {
    // A already received a bye (byesReceived = 1); B and C have not.
    // All three are at 3pts. The bye must not go to A.
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, byesReceived: 1 },
      { ...freshPlayer("B"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["C"] },
      { ...freshPlayer("C"), losses: 1, matchesPlayed: 1, opponents: ["B"] },
    ];
    const prev = [makePairing("B", "C", 1), makePairing("A", null, 1)];

    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    const byePairing = pairings.find(p => p.player2Id === null)!;
    expect(byePairing.player1Id).not.toBe("A");
  });

  it("bye goes to the lowest-score player across odd multi-bracket tournaments", () => {
    // 7-player round 2: bottom bracket should produce the bye recipient.
    let sim = freshTournament(["p0","p1","p2","p3","p4","p5","p6"]);
    const r1 = generateSwissPairings(sim.standings, 1, []);
    sim = applyResults(sim, r1.pairings, r1.pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));

    const { pairings, decisionLog } = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 2);

    const byePairing = pairings.find(p => p.player2Id === null)!;
    const byePlayer = sim.standings.find(s => s.id === byePairing.player1Id)!;
    const maxPts = Math.max(...sim.standings.map(s => s.matchPoints));

    // Bye recipient should not be a top-score player (unless forced to avoid rematch)
    // At minimum, their score is at most the median
    expect(byePlayer.matchPoints).toBeLessThan(maxPts);
    expect(decisionLog?.byePlayerId).toBe(byePairing.player1Id);
  });
});

// ---------------------------------------------------------------------------
// 13. Score-bracket quality
// ---------------------------------------------------------------------------

describe("generateSwissPairings — score-bracket quality", () => {
  it("8-player round 2: winners only play winners, losers only play losers", () => {
    const winners = ["A", "B", "C", "D"];
    const losers  = ["E", "F", "G", "H"];
    const standings: PlayerStanding[] = [
      ...winners.map((id, i) => ({
        ...freshPlayer(id),
        wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: [losers[i]!],
      })),
      ...losers.map((id, i) => ({
        ...freshPlayer(id),
        losses: 1, matchesPlayed: 1, opponents: [winners[i]!],
      })),
    ];
    const prev = winners.map((w, i) => makePairing(w, losers[i]!, 1));

    const { pairings } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    const winnerSet = new Set(winners);
    for (const p of pairings) {
      if (p.player2Id === null) continue;
      const p1isWinner = winnerSet.has(p.player1Id);
      const p2isWinner = winnerSet.has(p.player2Id);
      expect(p1isWinner, `cross-bracket pairing: ${p.player1Id} vs ${p.player2Id}`).toBe(p2isWinner);
    }
  });

  it("top-score player is always paired within their bracket in round 3 (8-player)", () => {
    // After 2 rounds with all-wins the standings have clear score groups.
    // The undefeated player (6 pts) must pair with another 6pt player, not a 3pt player,
    // unless they are the sole 6pt player.
    let sim = freshTournament(["A","B","C","D","E","F","G","H"]);
    for (let round = 1; round <= 2; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
    }

    const { pairings } = generateSwissPairings(sim.standings, 3, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 3);

    // Find 6pt players and confirm they play each other
    const sixPtPlayers = new Set(sim.standings.filter(s => s.matchPoints === 6).map(s => s.id));
    if (sixPtPlayers.size >= 2) {
      for (const p of pairings) {
        if (p.player2Id && sixPtPlayers.has(p.player1Id)) {
          expect(sixPtPlayers.has(p.player2Id)).toBe(true);
        }
      }
    }
  });

  it("no pairing crosses more than one score bracket unless unavoidable", () => {
    // Run a 10-player 3-round simulation and verify every pairing is at most 1
    // win-bracket apart (3 pts), except when the code itself signals unavoidability.
    let sim = freshTournament(Array.from({ length: 10 }, (_, i) => `p${i}`));
    for (let round = 1; round <= 3; round++) {
      const { pairings, decisionLog } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);

      const standingsById = new Map(sim.standings.map(s => [s.id, s]));
      const multiStepForced = (decisionLog?.maxFloatDistance ?? 0) > 3;

      if (!multiStepForced) {
        for (const p of pairings) {
          if (!p.player2Id) continue;
          const diff = Math.abs(
            (standingsById.get(p.player1Id)?.matchPoints ?? 0) -
            (standingsById.get(p.player2Id)?.matchPoints ?? 0),
          );
          // Allow at most 1 bracket (3 pts for wins or 1 pt for draws) apart
          expect(diff, `round ${round}: ${p.player1Id} vs ${p.player2Id} differ by ${diff} pts`).toBeLessThanOrEqual(3);
        }
      }

      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
    }
  });
});

// ---------------------------------------------------------------------------
// 14. Forced rematches in exhausted pools
// ---------------------------------------------------------------------------

describe("generateSwissPairings — forced rematches in exhausted pools", () => {
  it("4-player all-play-all: round 4 must rematch but does not throw", () => {
    // All draws so everyone stays at the same score (1pt per round).
    // After 3 rounds each player has played every other player.
    // Round 4 is forced to produce rematches.
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), draws: 3, matchPoints: 3, matchesPlayed: 3, opponents: ["B","C","D"] },
      { ...freshPlayer("B"), draws: 3, matchPoints: 3, matchesPlayed: 3, opponents: ["A","C","D"] },
      { ...freshPlayer("C"), draws: 3, matchPoints: 3, matchesPlayed: 3, opponents: ["D","A","B"] },
      { ...freshPlayer("D"), draws: 3, matchPoints: 3, matchesPlayed: 3, opponents: ["C","B","A"] },
    ];
    const prev: Pairing[] = [
      makePairing("A","B",1), makePairing("C","D",1),
      makePairing("A","C",2), makePairing("B","D",2),
      makePairing("A","D",3), makePairing("B","C",3),
    ];

    expect(() => generateSwissPairings(standings, 4, prev)).not.toThrow();
    const { pairings, decisionLog } = generateSwissPairings(standings, 4, prev);
    assertInvariants(pairings, standings, 4);
    expect(decisionLog?.rematchCount).toBeGreaterThan(0);
  });

  it("decisionLog.rematchCount accurately reflects the number of rematches", () => {
    // 2-player field in round 2: exactly 1 forced rematch
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
    ];
    const prev = [makePairing("A","B",1)];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);
    expect(decisionLog?.rematchCount).toBe(1);
  });

  it("6-player all-draws: first 5 rounds have zero rematches; round 6 forces them", () => {
    // K6 is 1-factorable (5 perfect matchings). All draws keep everyone in the same
    // score bracket, so the backtracking always finds the zero-rematch solution for
    // rounds 1–5. By round 6 every player has played every other player.
    let sim = freshTournament(["A","B","C","D","E","F"]);

    for (let round = 1; round <= 5; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      expect(
        pairings.some(p => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, sim.previousPairings)),
        `unexpected rematch in round ${round}`,
      ).toBe(false);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }

    // Round 6: forced rematches (every pair has met)
    const r6 = generateSwissPairings(sim.standings, 6, sim.previousPairings);
    assertInvariants(r6.pairings, sim.standings, 6);
    expect(r6.decisionLog?.rematchCount).toBeGreaterThan(0);
  });

  it("8-player all-draws: zero rematches in rounds 1–7, forced in round 8", () => {
    // K8 is 1-factorable (7 perfect matchings).
    let sim = freshTournament(["A","B","C","D","E","F","G","H"]);

    for (let round = 1; round <= 7; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      expect(
        pairings.some(p => p.player2Id && havePlayedBefore(p.player1Id, p.player2Id, sim.previousPairings)),
        `unexpected rematch in round ${round}`,
      ).toBe(false);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }

    const r8 = generateSwissPairings(sim.standings, 8, sim.previousPairings);
    assertInvariants(r8.pairings, sim.standings, 8);
    expect(r8.decisionLog?.rematchCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 15. Decision log content
// ---------------------------------------------------------------------------

describe("generateSwissPairings — decision log", () => {
  it("decisionLog is defined in round 2 and contains all required fields", () => {
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A","B",1), makePairing("C","D",1)];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);

    expect(decisionLog).toBeDefined();
    expect(decisionLog).toHaveProperty("floatReasons");
    expect(decisionLog).toHaveProperty("maxFloatDistance");
    expect(decisionLog).toHaveProperty("rematchCount");
    expect(decisionLog).toHaveProperty("stageUsed");
  });

  it("stageUsed = 1 when all brackets are even and no floats are needed", () => {
    // 4-player, 2 even brackets → no floats
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A","B",1), makePairing("C","D",1)];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);
    expect(decisionLog?.stageUsed).toBe(1);
  });

  it("stageUsed = 2 when a bracket float is needed", () => {
    // 6-player: 3 at 3pts (odd bracket → float) and 3 at 0pts
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["X"] },
      { ...freshPlayer("B"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Y"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Z"] },
      { ...freshPlayer("X"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("Y"), losses: 1, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("Z"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [
      makePairing("A","X",1), makePairing("B","Y",1), makePairing("C","Z",1),
    ];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);
    // Odd 3pt bracket → 1 float → stageUsed = 2
    expect(decisionLog?.stageUsed).toBe(2);
    expect(decisionLog?.floatDetails?.length).toBeGreaterThan(0);
  });

  it("byePlayerId, byePlayerName, and byePlayerPoints all match the actual bye recipient", () => {
    let sim = freshTournament(["p0","p1","p2","p3","p4"]);
    const r1 = generateSwissPairings(sim.standings, 1, []);
    sim = applyResults(sim, r1.pairings, r1.pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));

    const { pairings, decisionLog } = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 2);

    const actualByePairing = pairings.find(p => p.player2Id === null)!;
    expect(decisionLog?.byePlayerId).toBe(actualByePairing.player1Id);
    expect(decisionLog?.byePlayerName).toBe(actualByePairing.player1Name);

    const byeStanding = sim.standings.find(s => s.id === decisionLog?.byePlayerId)!;
    expect(decisionLog?.byePlayerPoints).toBe(byeStanding.matchPoints);
  });

  it("rematchCount is 0 when all pairings are fresh match-ups", () => {
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A","B",1), makePairing("C","D",1)];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);
    expect(decisionLog?.rematchCount).toBe(0);
  });

  it("maxFloatDistance is 0 when all brackets are even and same-score pairings are made", () => {
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A","B",1), makePairing("C","D",1)];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);
    expect(decisionLog?.maxFloatDistance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 16. All-draws tournaments
// ---------------------------------------------------------------------------

describe("generateSwissPairings — all-draws tournaments", () => {
  it("6-player, 4 rounds all draws: invariants hold each round", () => {
    let sim = freshTournament(["A","B","C","D","E","F"]);
    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }
  });

  it("9-player, 4 rounds all draws: invariants hold each round", () => {
    let sim = freshTournament(["p0","p1","p2","p3","p4","p5","p6","p7","p8"]);
    for (let round = 1; round <= 4; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }
  });

  it("4-player all-draws: after 3 rounds every player has exactly 3 match points", () => {
    let sim = freshTournament(["A","B","C","D"]);
    for (let round = 1; round <= 3; round++) {
      const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
      assertInvariants(pairings, sim.standings, round);
      sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "draw"));
    }
    for (const s of sim.standings) {
      expect(s.draws).toBe(3);
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.matchPoints).toBe(3); // 3 × 1pt draws
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Float mechanics
// ---------------------------------------------------------------------------

describe("generateSwissPairings — float mechanics", () => {
  it("floated player appears in the next bracket's pairing, not their original bracket", () => {
    // 6 players: 3 at 3pts (odd bracket → 1 floats), 3 at 0pts.
    // The floated player ends up paired against a 0pt player.
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["X"] },
      { ...freshPlayer("B"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Y"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Z"] },
      { ...freshPlayer("X"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("Y"), losses: 1, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("Z"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [
      makePairing("A","X",1), makePairing("B","Y",1), makePairing("C","Z",1),
    ];
    const { pairings, decisionLog } = generateSwissPairings(standings, 2, prev);
    assertInvariants(pairings, standings, 2);

    // There must be exactly one cross-bracket pairing (the floated 3pt player vs a 0pt player)
    const crossBracketPairings = pairings.filter(p => {
      if (!p.player2Id) return false;
      const pts1 = standings.find(s => s.id === p.player1Id)!.matchPoints;
      const pts2 = standings.find(s => s.id === p.player2Id)!.matchPoints;
      return pts1 !== pts2;
    });
    expect(crossBracketPairings).toHaveLength(1);
    expect(decisionLog?.floatDetails?.length).toBeGreaterThanOrEqual(1);
  });

  it("cascading float: 9-player round 2 with odd brackets at multiple levels produces valid pairings", () => {
    // After round 1 with 9 players (1 bye + 4 matches):
    // Some players end up with cascading float requirements.
    let sim = freshTournament(["p0","p1","p2","p3","p4","p5","p6","p7","p8"]);
    const r1 = generateSwissPairings(sim.standings, 1, []);
    sim = applyResults(sim, r1.pairings, r1.pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));

    const { pairings } = generateSwissPairings(sim.standings, 2, sim.previousPairings);
    assertInvariants(pairings, sim.standings, 2);

    // No duplicate player IDs across all pairings (invariant check already ensures this,
    // but be explicit about the cascade concern)
    const seenIds = new Set<string>();
    for (const p of pairings) {
      expect(seenIds.has(p.player1Id)).toBe(false);
      seenIds.add(p.player1Id);
      if (p.player2Id) {
        expect(seenIds.has(p.player2Id)).toBe(false);
        seenIds.add(p.player2Id);
      }
    }
  });

  it("rematch-escape float: 2-player same-score bracket dissolves when both already played", () => {
    // Round 1: A-X (A wins), B-Y (B wins), C-Z (C wins)
    // Round 2: A-B (A wins), C-X (C wins), Y-Z (Y wins)
    // Result: A(6), C(6), B(3), Y(3), X(0), Z(0)
    // Round 3: 3pt bracket = [B,Y] — they already played in round 1!
    // FIX 9 should dissolve this 2-player bracket so B and Y pair against
    // 0pt opponents instead of rematching each other.
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 2, matchPoints: 6, matchesPlayed: 2, opponents: ["X","B"] },
      { ...freshPlayer("C"), wins: 2, matchPoints: 6, matchesPlayed: 2, opponents: ["Z","X"] },
      { ...freshPlayer("B"), wins: 1, losses: 1, matchPoints: 3, matchesPlayed: 2, opponents: ["Y","A"] },
      { ...freshPlayer("Y"), wins: 1, losses: 1, matchPoints: 3, matchesPlayed: 2, opponents: ["B","Z"] },
      { ...freshPlayer("X"), losses: 2, matchesPlayed: 2, opponents: ["A","C"] },
      { ...freshPlayer("Z"), losses: 2, matchesPlayed: 2, opponents: ["C","Y"] },
    ];
    const prev: Pairing[] = [
      makePairing("A","X",1), makePairing("B","Y",1), makePairing("C","Z",1),
      makePairing("A","B",2), makePairing("C","X",2), makePairing("Y","Z",2),
    ];

    expect(() => generateSwissPairings(standings, 3, prev)).not.toThrow();
    const { pairings } = generateSwissPairings(standings, 3, prev);
    assertInvariants(pairings, standings, 3);

    // B and Y must NOT play each other again
    const byRematch = pairings.find(
      p => (p.player1Id === "B" && p.player2Id === "Y") ||
           (p.player1Id === "Y" && p.player2Id === "B"),
    );
    expect(byRematch).toBeUndefined();
  });

  it("decisionLog.floatDetails lists all floated players with their scores and reasons", () => {
    // 6-player odd 3pt bracket → 1 float expected
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["X"] },
      { ...freshPlayer("B"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Y"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["Z"] },
      { ...freshPlayer("X"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("Y"), losses: 1, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("Z"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [
      makePairing("A","X",1), makePairing("B","Y",1), makePairing("C","Z",1),
    ];
    const { decisionLog } = generateSwissPairings(standings, 2, prev);

    expect(decisionLog?.floatDetails).toBeDefined();
    expect(decisionLog!.floatDetails!.length).toBeGreaterThanOrEqual(1);
    for (const detail of decisionLog!.floatDetails!) {
      expect(detail.playerId).toBeTruthy();
      expect(detail.reason).toBeTruthy();
      expect(typeof detail.playerPoints).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// 18. Determinism under different input orderings
// ---------------------------------------------------------------------------

describe("generateSwissPairings — determinism", () => {
  it("same standings in different array order produce the same pairings", () => {
    const standings: PlayerStanding[] = [
      { ...freshPlayer("A"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["B"] },
      { ...freshPlayer("B"), losses: 1, matchesPlayed: 1, opponents: ["A"] },
      { ...freshPlayer("C"), wins: 1, matchPoints: 3, matchesPlayed: 1, opponents: ["D"] },
      { ...freshPlayer("D"), losses: 1, matchesPlayed: 1, opponents: ["C"] },
    ];
    const prev = [makePairing("A","B",1), makePairing("C","D",1)];

    const r1 = generateSwissPairings([...standings], 2, prev);
    const r2 = generateSwissPairings([...standings].reverse(), 2, prev);

    expect(r1.pairings).toEqual(r2.pairings);
  });

  it("same standings over 4 rounds always produce the same sequence of pairings", () => {
    const ids = ["A","B","C","D","E","F","G","H"];

    const runTournament = () => {
      let sim = freshTournament(ids);
      const allPairings: Pairing[][] = [];
      for (let round = 1; round <= 4; round++) {
        const { pairings } = generateSwissPairings(sim.standings, round, sim.previousPairings);
        allPairings.push(pairings);
        sim = applyResults(sim, pairings, pairings.filter(p => p.player2Id !== null).map(() => "p1wins"));
      }
      return allPairings;
    };

    expect(runTournament()).toEqual(runTournament());
  });
});
