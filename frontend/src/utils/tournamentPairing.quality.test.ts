import { describe, it, expect } from "vitest";
import { generateSwissPairings, havePlayedBefore } from "./tournamentPairing";
import type { PlayerStanding, Pairing } from "./tournamentPairing";

/** ---------- helpers ---------- */

function makeStanding(
  id: string,
  pts: number,
  byesReceived = 0,
  // optional explicit record (otherwise derived from pts, but that’s lossy)
  record?: {
    wins: number;
    draws: number;
    losses: number;
    matchesPlayed: number;
  },
): PlayerStanding {
  const derived = (() => {
    // Only supports common “round-ish” states; for tests we mostly care about matchPoints/byes.
    // If you need specific records, pass record explicitly.
    if (pts === 0) return { wins: 0, draws: 0, losses: 1, matchesPlayed: 1 };
    if (pts === 1) return { wins: 0, draws: 1, losses: 0, matchesPlayed: 1 };
    if (pts === 3) return { wins: 1, draws: 0, losses: 0, matchesPlayed: 1 };
    // fallback
    return {
      wins: Math.floor(pts / 3),
      draws: pts % 3,
      losses: 0,
      matchesPlayed: Math.floor(pts / 3) + (pts % 3),
    };
  })();

  const r = record ?? derived;
  return {
    id,
    name: id,
    matchPoints: pts,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    matchesPlayed: r.matchesPlayed,
    opponents: [],
    byesReceived,
  };
}

function idsUsed(pairings: Pairing[]) {
  const used = new Set<string>();
  for (const p of pairings) {
    used.add(p.player1Id);
    if (p.player2Id) used.add(p.player2Id);
  }
  return used;
}

function byePairing(pairings: Pairing[]) {
  return pairings.find((p) => p.player2Id === null) ?? null;
}

function pointsOf(standings: PlayerStanding[], id: string) {
  return standings.find((s) => s.id === id)?.matchPoints ?? 0;
}

function countSameScoreMatches(
  pairings: Pairing[],
  standings: PlayerStanding[],
) {
  let c = 0;
  for (const p of pairings) {
    if (!p.player2Id) continue;
    if (pointsOf(standings, p.player1Id) === pointsOf(standings, p.player2Id))
      c++;
  }
  return c;
}

function maxPointDiff(pairings: Pairing[], standings: PlayerStanding[]) {
  let m = 0;
  for (const p of pairings) {
    if (!p.player2Id) continue;
    const a = pointsOf(standings, p.player1Id);
    const b = pointsOf(standings, p.player2Id);
    m = Math.max(m, Math.abs(a - b));
  }
  return m;
}

function rematchCount(pairings: Pairing[], previous: Pairing[]) {
  let c = 0;
  for (const p of pairings) {
    if (!p.player2Id) continue;
    if (havePlayedBefore(p.player1Id, p.player2Id, previous)) c++;
  }
  return c;
}

/**
 * Swiss-quality invariant:
 * If each score bracket has an even number of players (and no bye needed),
 * then ALL matches should be within bracket (maxPointDiff=0).
 */
function expectNoFloatsWhenPerfectBrackets(
  standings: PlayerStanding[],
  pairings: Pairing[],
) {
  const counts = new Map<number, number>();
  for (const s of standings)
    counts.set(s.matchPoints, (counts.get(s.matchPoints) ?? 0) + 1);
  const allEven = Array.from(counts.values()).every((n) => n % 2 === 0);
  if (standings.length % 2 === 0 && allEven) {
    expect(maxPointDiff(pairings, standings)).toBe(0);
  }
}

/**
 * Swiss-quality invariant:
 * If top bracket has >=2 players, then there should be at least one top-vs-top match
 * (unless rematch constraints *force* otherwise).
 */
function expectTopBracketPairsInternallyWhenPossible(
  standings: PlayerStanding[],
  pairings: Pairing[],
) {
  const topPts = Math.max(...standings.map((s) => s.matchPoints));
  const topIds = standings
    .filter((s) => s.matchPoints === topPts)
    .map((s) => s.id);
  if (topIds.length >= 2) {
    const hasTopVsTop = pairings.some((p) => {
      if (!p.player2Id) return false;
      const a = pointsOf(standings, p.player1Id);
      const b = pointsOf(standings, p.player2Id);
      return a === topPts && b === topPts;
    });
    expect(hasTopVsTop).toBe(true);
  }
}

function expectCoverage(standings: PlayerStanding[], pairings: Pairing[]) {
  expect(pairings).toHaveLength(Math.ceil(standings.length / 2));
  expect(idsUsed(pairings).size).toBe(standings.length);
  const byeCount = pairings.filter((p) => p.player2Id === null).length;
  expect(byeCount).toBe(standings.length % 2 === 1 ? 1 : 0);
}

function expectByeFromMinimumScore(
  standings: PlayerStanding[],
  pairings: Pairing[],
) {
  if (standings.length % 2 === 0) return;
  const bye = byePairing(pairings);
  expect(bye).not.toBeNull();
  const minPts = Math.min(...standings.map((s) => s.matchPoints));
  expect(pointsOf(standings, bye!.player1Id)).toBe(minPts);
}

/** ---------- tests ---------- */

describe("Swiss pairing quality tests", () => {
  it("Perfect brackets (even counts) => no floats at all", () => {
    // 8 players: 4 on 3pts, 4 on 0pts => should be 2x(3v3) and 2x(0v0)
    const standings = [
      makeStanding("A", 3),
      makeStanding("B", 3),
      makeStanding("C", 3),
      makeStanding("D", 3),
      makeStanding("E", 0),
      makeStanding("F", 0),
      makeStanding("G", 0),
      makeStanding("H", 0),
    ];
    const result = generateSwissPairings(standings, 2, []);
    expectCoverage(standings, result.pairings);
    expect(maxPointDiff(result.pairings, standings)).toBe(0);
    expect(countSameScoreMatches(result.pairings, standings)).toBe(4);
  });

  it("Your Test 2 shape => should maximise same-score pairings and keep diff <= 1 when possible", () => {
    // 9 players: 4x3pts, 2x1pt, 3x0pt => expect:
    // - two 3v3, one 1v1, one 0v0, and a bye in 0pt bracket
    const standings = [
      makeStanding("a", 3),
      makeStanding("b", 3),
      makeStanding("c", 3),
      makeStanding("d", 3),
      makeStanding("e", 1),
      makeStanding("f", 1),
      makeStanding("g", 0),
      makeStanding("h", 0),
      makeStanding("i", 0),
    ];
    const previous: Pairing[] = []; // doesn’t matter for this quality assertion
    const result = generateSwissPairings(standings, 2, previous);

    expectCoverage(standings, result.pairings);
    expectByeFromMinimumScore(standings, result.pairings);

    // At least 4 same-score matches (3v3,3v3,1v1,0v0) out of 4 non-bye matches
    expect(countSameScoreMatches(result.pairings, standings)).toBe(4);

    // In this structure, no match should ever be 3 vs 0 if you’re pairing brackets correctly
    expect(maxPointDiff(result.pairings, standings)).toBeLessThanOrEqual(1);

    expectTopBracketPairsInternallyWhenPossible(standings, result.pairings);
  });

  it("Odd top bracket => exactly one floater and it should float down only one step when next bracket exists", () => {
    // 7 players: 3x3pts, 4x0pts
    // Expect: one 3pt floats to 0pt bracket, but remaining 3pts should pair 3v3,
    // and float distance should be 3 (because only 3 and 0 exist) — BUT importantly:
    // you should still have at least one 3v3.
    const standings = [
      makeStanding("A", 3),
      makeStanding("B", 3),
      makeStanding("C", 3),
      makeStanding("D", 0),
      makeStanding("E", 0),
      makeStanding("F", 0),
      makeStanding("G", 0),
    ];
    const result = generateSwissPairings(standings, 2, []);
    expectCoverage(standings, result.pairings);

    // Must contain at least one 3v3.
    expectTopBracketPairsInternallyWhenPossible(standings, result.pairings);

    // With only {3,0} points present, any float is “3 points diff”.
    // This test is mainly to prevent *multiple* top players being paired down unnecessarily.
    const sameScore = countSameScoreMatches(result.pairings, standings);
    expect(sameScore).toBeGreaterThanOrEqual(2); // should get 3v3 + 0v0 at least
  });

  it("Avoid rematches when an alternative exists (simple swap case)", () => {
    // 8 players all on same points, but previous pairings create a trivial avoidable rematch.
    const standings = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id) =>
      makeStanding(id, 3),
    );

    const previous: Pairing[] = [
      {
        player1Id: "A",
        player1Name: "A",
        player2Id: "E",
        player2Name: "E",
        roundNumber: 1,
      },
      {
        player1Id: "B",
        player1Name: "B",
        player2Id: "F",
        player2Name: "F",
        roundNumber: 1,
      },
      {
        player1Id: "C",
        player1Name: "C",
        player2Id: "G",
        player2Name: "G",
        roundNumber: 1,
      },
      {
        player1Id: "D",
        player1Name: "D",
        player2Id: "H",
        player2Name: "H",
        roundNumber: 1,
      },
    ];

    const result = generateSwissPairings(standings, 2, previous);
    expectCoverage(standings, result.pairings);

    // In this symmetric case there are *many* non-rematch options, so rematches should be 0.
    expect(rematchCount(result.pairings, previous)).toBe(0);
  });

  it("Bye goes to lowest points AND (within that points group) fewest byesReceived", () => {
    // 5 players: all 0 pts, but one has already had a bye before -> bye should go to someone else.
    const standings = [
      makeStanding("A", 0, 1), // already had bye
      makeStanding("B", 0, 0),
      makeStanding("C", 0, 0),
      makeStanding("D", 0, 0),
      makeStanding("E", 0, 0),
    ];
    const result = generateSwissPairings(standings, 3, []);
    expectCoverage(standings, result.pairings);

    const bye = byePairing(result.pairings);
    expect(bye).not.toBeNull();
    const byeStanding = standings.find((s) => s.id === bye!.player1Id)!;
    expect(byeStanding.matchPoints).toBe(0);
    expect(byeStanding.byesReceived).toBe(0); // should NOT be A
  });

  it("General safety: if brackets are perfect, no floats (derived check)", () => {
    // 12 players: 4x6pts, 4x3pts, 4x0pts => perfect brackets, no bye
    const standings = [
      ...["A", "B", "C", "D"].map((id) => makeStanding(id, 6)),
      ...["E", "F", "G", "H"].map((id) => makeStanding(id, 3)),
      ...["I", "J", "K", "L"].map((id) => makeStanding(id, 0)),
    ];
    const result = generateSwissPairings(standings, 3, []);
    expectCoverage(standings, result.pairings);
    expectNoFloatsWhenPerfectBrackets(standings, result.pairings);
  });
});
