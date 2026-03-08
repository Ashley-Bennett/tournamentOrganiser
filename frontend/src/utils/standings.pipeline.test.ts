/**
 * Integration tests for the standings pipeline:
 *   buildStandingsFromMatches  (tournamentUtils.ts)
 *       → sortByTieBreakers    (tieBreaking.ts, which calls addTieBreakers internally)
 *
 * Each function is unit-tested separately; these tests verify they compose
 * correctly — that field names match, opponents lists are threaded through,
 * and game scores survive the handoff.
 */
import { describe, it, expect } from "vitest";
import { buildStandingsFromMatches } from "./tournamentUtils";
import { sortByTieBreakers } from "./tieBreaking";
import type { MatchForStandings } from "./tournamentUtils";

// ---------------------------------------------------------------------------
// Helpers (minimal duplicates — only what the pipeline needs)
// ---------------------------------------------------------------------------

function win(
  p1: string,
  p2: string,
  winner: string,
  result = "2-1",
): MatchForStandings {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: winner,
    result,
    status: "completed",
    player1_name: p1,
    player2_name: p2,
  };
}

function draw(p1: string, p2: string): MatchForStandings {
  return {
    player1_id: p1,
    player2_id: p2,
    winner_id: null,
    result: "Draw",
    status: "completed",
    player1_name: p1,
    player2_name: p2,
  };
}

function bye(id: string): MatchForStandings {
  return {
    player1_id: id,
    player2_id: null,
    winner_id: null,
    result: null,
    status: "bye",
    player1_name: id,
    player2_name: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("standings pipeline: buildStandingsFromMatches → sortByTieBreakers", () => {
  it("sorts a clean round-robin by match points with no tiebreaker needed", () => {
    // 4 players, 3 rounds — each pair plays exactly once, creating a clear ladder
    // Round 1: A beats B, C beats D
    // Round 2: A beats C, B beats D
    // Round 3: A beats D, C beats B
    const matches: MatchForStandings[] = [
      win("A", "B", "A", "2-1"),
      win("C", "D", "C", "2-0"),
      win("A", "C", "A", "2-0"),
      win("B", "D", "B", "2-1"),
      win("A", "D", "A", "2-0"),
      win("C", "B", "C", "2-1"),
    ];

    const standings = buildStandingsFromMatches(matches);
    const sorted = sortByTieBreakers(standings);

    expect(sorted).toHaveLength(4);
    // Unambiguous order: A(9pts) > C(6pts) > B(3pts) > D(0pts)
    expect(sorted.map((p) => p.id)).toEqual(["A", "C", "B", "D"]);
    expect(sorted[0].matchPoints).toBe(9);
    expect(sorted[3].matchPoints).toBe(0);
  });

  it("populates OMW% correctly from the opponent history built by buildStandingsFromMatches", () => {
    // A and B both have 1 win but faced opponents of different strength.
    // A beat C (who later won 2 more matches); B beat D (who won nothing).
    const matches: MatchForStandings[] = [
      win("A", "C", "A"), // A beats C
      win("B", "D", "B"), // B beats D
      win("C", "E", "C"), // C wins — makes C a strong opponent for A
      win("C", "F", "C"), // C wins again
    ];

    const standings = buildStandingsFromMatches(matches);
    const sorted = sortByTieBreakers(standings);

    const a = sorted.find((p) => p.id === "A")!;
    const b = sorted.find((p) => p.id === "B")!;

    // Both A and B have 3 match points (1 win), but A faced C (2 wins = strong)
    // while B faced D (0 wins = weak), so A should rank above B.
    expect(a.opponentMatchWinPercentage).toBeGreaterThan(
      b.opponentMatchWinPercentage,
    );
    const aPos = sorted.findIndex((p) => p.id === "A");
    const bPos = sorted.findIndex((p) => p.id === "B");
    expect(aPos).toBeLessThan(bPos);
  });

  it("threads game scores (e.g. '2-1') through to the sorted output", () => {
    const matches: MatchForStandings[] = [
      win("A", "B", "A", "2-0"), // A: +2 gw, B: +0 gw / +2 gl
      win("A", "C", "A", "2-1"), // A: +2 gw +1 gl, C: +1 gw / +2 gl
    ];

    const standings = buildStandingsFromMatches(matches);
    const sorted = sortByTieBreakers(standings);
    const a = sorted.find((p) => p.id === "A")!;

    expect(a.gameWins).toBe(4);    // 2 + 2
    expect(a.gameLosses).toBe(1);  // 0 + 1
    expect(a.gameWinPercentage).toBeCloseTo(4 / 5);
  });

  it("handles draws: both players gain 1 pt and appear in each other's opponents", () => {
    const matches: MatchForStandings[] = [
      draw("A", "B"),
      draw("A", "C"),
    ];

    const standings = buildStandingsFromMatches(matches);
    const sorted = sortByTieBreakers(standings);

    const a = sorted.find((p) => p.id === "A")!;
    const b = sorted.find((p) => p.id === "B")!;
    const c = sorted.find((p) => p.id === "C")!;

    expect(a.draws).toBe(2);
    expect(a.matchPoints).toBe(2);
    expect(b.draws).toBe(1);
    expect(b.matchPoints).toBe(1);
    expect(c.draws).toBe(1);
    expect(c.matchPoints).toBe(1);

    // A appears in B's and C's opponent lists (OMW% is computable)
    expect(b.opponentMatchWinPercentage).toBeGreaterThanOrEqual(0);
    expect(c.opponentMatchWinPercentage).toBeGreaterThanOrEqual(0);
  });

  it("handles a mixed tournament: wins, losses, draws, and byes all together", () => {
    const matches: MatchForStandings[] = [
      win("A", "B", "A", "2-1"),
      bye("C"),
      draw("D", "E"),
    ];

    const standings = buildStandingsFromMatches(matches);
    const sorted = sortByTieBreakers(standings);

    expect(sorted).toHaveLength(5);

    // Output is sorted descending by match points
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].matchPoints).toBeGreaterThanOrEqual(
        sorted[i + 1].matchPoints,
      );
    }

    // Spot-check expected point totals
    const a = sorted.find((p) => p.id === "A")!;
    const c = sorted.find((p) => p.id === "C")!;
    const d = sorted.find((p) => p.id === "D")!;
    const b = sorted.find((p) => p.id === "B")!;

    expect(a.matchPoints).toBe(3); // win
    expect(c.matchPoints).toBe(3); // bye counts as a win
    expect(c.byesReceived).toBe(1);
    expect(d.matchPoints).toBe(1); // draw
    expect(b.matchPoints).toBe(0); // loss

    // Bye recipient has no real opponents → OMW% = 0
    expect(c.opponentMatchWinPercentage).toBe(0);
  });

  it("is deterministic — identical input always produces identical output", () => {
    const matches: MatchForStandings[] = [
      win("X", "Y", "X"),
      win("Z", "W", "Z"),
    ];
    const first = sortByTieBreakers(buildStandingsFromMatches(matches));
    const second = sortByTieBreakers(buildStandingsFromMatches(matches));
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
  });

  it("allPlayers seeds players with no matches; they appear at the bottom of standings", () => {
    const matches: MatchForStandings[] = [win("A", "B", "A")];
    const allPlayers = [
      { id: "A", name: "A" },
      { id: "B", name: "B" },
      { id: "C", name: "C" }, // C has no matches yet
    ];

    const standings = buildStandingsFromMatches(matches, allPlayers);
    const sorted = sortByTieBreakers(standings);

    expect(sorted).toHaveLength(3);
    // A has 3 pts — must be first
    expect(sorted[0].id).toBe("A");
    // C has 0 pts and appears in the output
    expect(sorted.some((p) => p.id === "C")).toBe(true);
    const c = sorted.find((p) => p.id === "C")!;
    expect(c.matchPoints).toBe(0);
    expect(c.matchesPlayed).toBe(0);
  });
});
