import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSwissPairings,
  calculateMatchPoints,
} from "./tournamentPairing";
import type { PlayerStanding, Pairing } from "./tournamentPairing";

/**
 * Helpers
 */
function makeStandingExact(params: {
  id: string;
  name?: string;
  wins: number;
  draws: number;
  losses: number;
  matchesPlayed?: number;
  byesReceived?: number;
  opponents?: string[];
}): PlayerStanding {
  const matchesPlayed =
    params.matchesPlayed ?? params.wins + params.draws + params.losses;

  const matchPoints = calculateMatchPoints(params.wins, params.draws);

  return {
    id: params.id,
    name: params.name ?? params.id,
    wins: params.wins,
    draws: params.draws,
    losses: params.losses,
    matchesPlayed,
    matchPoints,
    byesReceived: params.byesReceived ?? 0,
    opponents: params.opponents ?? [],
  };
}

function pointsById(standings: PlayerStanding[]) {
  return new Map(standings.map((s) => [s.id, s.matchPoints] as const));
}

function pairingPointsDiffs(pairings: Pairing[], pts: Map<string, number>) {
  return pairings
    .filter((p) => p.player2Id !== null)
    .map((p) => {
      const a = pts.get(p.player1Id) ?? 0;
      const b = pts.get(p.player2Id!) ?? 0;
      return Math.abs(a - b);
    });
}

function countSameScoreMatches(pairings: Pairing[], pts: Map<string, number>) {
  let same = 0;
  let totalNonBye = 0;
  for (const p of pairings) {
    if (!p.player2Id) continue;
    totalNonBye++;
    const a = pts.get(p.player1Id) ?? 0;
    const b = pts.get(p.player2Id) ?? 0;
    if (a === b) same++;
  }
  return { same, totalNonBye };
}

function byeRecipient(pairings: Pairing[]) {
  return pairings.find((p) => p.player2Id === null) ?? null;
}

function assertNoDuplicatePlayers(
  pairings: Pairing[],
  expectedPlayerCount: number,
) {
  const used = new Set<string>();
  for (const p of pairings) {
    expect(p.player1Id).toBeTruthy();
    expect(used.has(p.player1Id)).toBe(false);
    used.add(p.player1Id);

    if (p.player2Id) {
      expect(p.player2Id).not.toBe(p.player1Id);
      expect(used.has(p.player2Id)).toBe(false);
      used.add(p.player2Id);
    }
  }
  expect(used.size).toBe(expectedPlayerCount);
}

/**
 * Optional: make Round 1 deterministic in tests (your round 1 uses Math.random()).
 * This avoids flaky tests.
 */
beforeEach(() => {
  let seed = 123456789;
  vi.spyOn(Math, "random").mockImplementation(() => {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    // convert to [0,1)
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Swiss pairing quality (bracket integrity)", () => {
  it("Test 2 shape: 4x3pts, 2x1pt, 3x0pt => must maximize same-score pairings and give bye to 0pt", () => {
    // 9 players total
    // 3pts: A,C,G,I
    // 1pt: B,F
    // 0pt: D,E,H
    const standings: PlayerStanding[] = [
      makeStandingExact({ id: "a", wins: 1, draws: 0, losses: 0 }), // 3
      makeStandingExact({ id: "c", wins: 1, draws: 0, losses: 0 }), // 3
      makeStandingExact({ id: "g", wins: 1, draws: 0, losses: 0 }), // 3
      makeStandingExact({ id: "i", wins: 1, draws: 0, losses: 0 }), // 3

      makeStandingExact({ id: "b", wins: 0, draws: 1, losses: 0 }), // 1
      makeStandingExact({ id: "f", wins: 0, draws: 1, losses: 0 }), // 1

      makeStandingExact({ id: "d", wins: 0, draws: 0, losses: 1 }), // 0
      makeStandingExact({ id: "e", wins: 0, draws: 0, losses: 1 }), // 0
      makeStandingExact({ id: "h", wins: 0, draws: 0, losses: 1 }), // 0
    ];

    // Previous pairings can be empty for this “shape” quality test
    // (If your algorithm requires previousPairings, keep it empty)
    const result = generateSwissPairings(standings, 2, []);
    const pts = pointsById(standings);

    // Basic invariants (still useful)
    expect(result.pairings).toHaveLength(Math.ceil(standings.length / 2));
    assertNoDuplicatePlayers(result.pairings, standings.length);
    expect(result.pairings.filter((p) => p.player2Id === null)).toHaveLength(1);

    // Bye must be from the minimum score bracket (0pts here)
    const bye = byeRecipient(result.pairings);
    expect(bye).not.toBeNull();
    const byePts = pts.get(bye!.player1Id);
    expect(byePts).toBe(0);

    // Quality expectations:
    // - We should get 4 non-bye matches total (since 9 players => 1 bye)
    // - In this distribution, we can make ALL 4 matches same-score (two 3v3, one 1v1, one 0v0)
    const { same, totalNonBye } = countSameScoreMatches(result.pairings, pts);
    expect(totalNonBye).toBe(4);
    expect(same).toBe(4);

    // Stronger: no match should have a points gap > 0 for this scenario
    // (If your logic ever needs to float, that indicates a bug in bracket processing here.)
    const diffs = pairingPointsDiffs(result.pairings, pts);
    expect(Math.max(...diffs)).toBe(0);
  });

  it("Even top bracket must not create a floater: 4x6pts, 2x3pts, 2x0pts (8 players) => all matches same-score", () => {
    const standings: PlayerStanding[] = [
      // 6pts
      makeStandingExact({ id: "a", wins: 2, draws: 0, losses: 0 }),
      makeStandingExact({ id: "b", wins: 2, draws: 0, losses: 0 }),
      makeStandingExact({ id: "c", wins: 2, draws: 0, losses: 0 }),
      makeStandingExact({ id: "d", wins: 2, draws: 0, losses: 0 }),
      // 3pts
      makeStandingExact({ id: "e", wins: 1, draws: 0, losses: 1 }),
      makeStandingExact({ id: "f", wins: 1, draws: 0, losses: 1 }),
      // 0pts
      makeStandingExact({ id: "g", wins: 0, draws: 0, losses: 2 }),
      makeStandingExact({ id: "h", wins: 0, draws: 0, losses: 2 }),
    ];

    const result = generateSwissPairings(standings, 3, []);
    const pts = pointsById(standings);

    expect(result.pairings.filter((p) => p.player2Id === null)).toHaveLength(0);

    const { same, totalNonBye } = countSameScoreMatches(result.pairings, pts);
    expect(totalNonBye).toBe(4);
    expect(same).toBe(4);

    const diffs = pairingPointsDiffs(result.pairings, pts);
    expect(Math.max(...diffs)).toBe(0);
  });

  it("Odd bracket float should only float ONE player down ONE bracket when possible: 5x3pts + 4x0pts => max diff 3 (only for the floater match)", () => {
    // Here, 3pt bracket is odd, so exactly one 3pt player must float to 0pt.
    const standings: PlayerStanding[] = [
      makeStandingExact({ id: "a", wins: 1, draws: 0, losses: 0 }),
      makeStandingExact({ id: "b", wins: 1, draws: 0, losses: 0 }),
      makeStandingExact({ id: "c", wins: 1, draws: 0, losses: 0 }),
      makeStandingExact({ id: "d", wins: 1, draws: 0, losses: 0 }),
      makeStandingExact({ id: "e", wins: 1, draws: 0, losses: 0 }),

      makeStandingExact({ id: "f", wins: 0, draws: 0, losses: 1 }),
      makeStandingExact({ id: "g", wins: 0, draws: 0, losses: 1 }),
      makeStandingExact({ id: "h", wins: 0, draws: 0, losses: 1 }),
      makeStandingExact({ id: "i", wins: 0, draws: 0, losses: 1 }),
    ];

    const result = generateSwissPairings(standings, 2, []);
    const pts = pointsById(standings);

    // With 9 players, bye must be from 0pt bracket
    const bye = byeRecipient(result.pairings);
    expect(bye).not.toBeNull();
    expect(pts.get(bye!.player1Id)).toBe(0);

    // Non-bye matches: 4 total.
    // We expect: two 3v3, one 0v0, and one 3v0 (the single floater match).
    const diffs = pairingPointsDiffs(result.pairings, pts);
    diffs.sort((a, b) => a - b);

    // There should be exactly ONE 3-point-diff match (3v0), rest diff 0.
    const threeDiff = diffs.filter((d) => d === 3).length;
    const zeroDiff = diffs.filter((d) => d === 0).length;
    expect(threeDiff).toBe(1);
    expect(zeroDiff).toBe(3);
  });
});
