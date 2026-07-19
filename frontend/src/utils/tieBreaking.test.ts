import { describe, it, expect } from "vitest";
import {
  calculateOpponentMatchWinPercentage,
  calculateOpponentOpponentMatchWinPercentage,
  addTieBreakers,
  sortByTieBreakers,
} from "./tieBreaking";
import type { PlayerStanding } from "./tieBreaking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function player(
  id: string,
  wins: number,
  losses: number,
  draws: number,
  opponents: string[] = [],
  opponentResults: Record<string, "win" | "loss" | "draw"> = {},
  gameWins = 0,
  gameLosses = 0,
  byesReceived = 0,
): PlayerStanding {
  return {
    id,
    name: id,
    matchPoints: wins * 3 + draws,
    wins,
    losses,
    draws,
    matchesPlayed: wins + losses + draws,
    opponents,
    opponentResults,
    gameWins,
    gameLosses,
    byesReceived,
  };
}

function map(...players: PlayerStanding[]): Map<string, PlayerStanding> {
  return new Map(players.map((p) => [p.id, p]));
}

// ---------------------------------------------------------------------------
// calculateOpponentMatchWinPercentage
// ---------------------------------------------------------------------------

describe("calculateOpponentMatchWinPercentage", () => {
  it("returns 0 when the player has no opponents", () => {
    const p = player("A", 1, 0, 0);
    expect(calculateOpponentMatchWinPercentage(p, map(p))).toBe(0);
  });

  it("returns the win rate of a single opponent", () => {
    const opp = player("B", 2, 1, 0); // 2 wins out of 3 matches = 0.666… (between floor/cap)
    const p = player("A", 1, 0, 0, ["B"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, opp))).toBeCloseTo(
      2 / 3,
    );
  });

  it("averages across multiple opponents", () => {
    const strong = player("B", 3, 0, 0); // 1.0 (no cap for active players)
    const weak = player("C", 0, 3, 0); // 0.0 → floored to 0.25
    const p = player("A", 0, 0, 0, ["B", "C"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, strong, weak))).toBeCloseTo(0.625);
  });

  it("counts draws as rounds played but not as wins (handbook §5.3.3.1)", () => {
    // Ged: 2-1-1 → 2 wins / 4 rounds = 0.5 (the draw adds a round, not half a win)
    const ged = player("Ged", 2, 1, 1);
    const ethan = player("Ethan", 3, 1, 0, ["Ged"]);
    expect(calculateOpponentMatchWinPercentage(ethan, map(ethan, ged))).toBeCloseTo(0.5);
  });

  it("applies 25% floor to opponents with very poor records", () => {
    const terrible = player("B", 0, 4, 0); // 0/4 = 0% → floored to 0.25
    const p = player("A", 1, 0, 0, ["B"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, terrible))).toBeCloseTo(0.25);
  });

  it("does not cap active opponents with perfect records", () => {
    const perfect = player("B", 4, 0, 0); // 4/4 = 100% — completed the event, cap is 100%
    const p = player("A", 1, 0, 0, ["B"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, perfect))).toBeCloseTo(1.0);
  });

  it("caps dropped opponents at 75% (handbook §5.3.3.1)", () => {
    const droppedPerfect = player("B", 4, 0, 0); // 100% but dropped → capped to 0.75
    const p = player("A", 1, 0, 0, ["B"]);
    expect(
      calculateOpponentMatchWinPercentage(p, map(p, droppedPerfect), new Set(["B"])),
    ).toBeCloseTo(0.75);
  });

  it("excludes bye rounds from an opponent's win percentage", () => {
    // B: 3 wins over 4 rounds, one win was a bye → 2 wins / 3 rounds
    const byeWinner = player("B", 3, 1, 0, [], {}, 0, 0, 1);
    const p = player("A", 1, 0, 0, ["B"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, byeWinner))).toBeCloseTo(2 / 3);
  });

  it("skips opponents with 0 matches played (avoids divide-by-zero)", () => {
    const inactive = player("B", 0, 0, 0); // 0 matches
    const p = player("A", 1, 0, 0, ["B"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p, inactive))).toBe(0);
  });

  it("skips opponents not found in the standings map", () => {
    const p = player("A", 1, 0, 0, ["ghost-id"]);
    expect(calculateOpponentMatchWinPercentage(p, map(p))).toBe(0);
  });

  it("only counts opponents found in map when some are missing", () => {
    const real = player("B", 2, 0, 0); // 2/2 = 1.0
    const p = player("A", 0, 0, 0, ["B", "ghost"]);
    // Only B is counted, so result = 1.0
    expect(calculateOpponentMatchWinPercentage(p, map(p, real))).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// calculateOpponentOpponentMatchWinPercentage
// ---------------------------------------------------------------------------

describe("calculateOpponentOpponentMatchWinPercentage", () => {
  it("returns 0 when the player has no opponents", () => {
    const p = player("A", 1, 0, 0);
    expect(calculateOpponentOpponentMatchWinPercentage(p, map(p))).toBe(0);
  });

  it("computes OOMW% as the average of each opponent's OMW%", () => {
    // Chain: A → B → C (C has a 100% win rate; no cap for active players)
    const c = player("C", 3, 0, 0);
    const b = player("B", 1, 0, 0, ["C"]);
    const a = player("A", 1, 0, 0, ["B"]);
    const standings = map(a, b, c);
    // B's OMW% = 1.0, so A's OOMW% = 1.0
    expect(
      calculateOpponentOpponentMatchWinPercentage(a, standings),
    ).toBeCloseTo(1.0);
  });

  it("averages when the player has multiple opponents with different OMW%s", () => {
    const c = player("C", 3, 0, 0); // strong
    const d = player("D", 0, 3, 0); // weak
    const b1 = player("B1", 1, 0, 0, ["C"]); // OMW% = 1.0
    const b2 = player("B2", 1, 0, 0, ["D"]); // OMW% = 0.25 (floored)
    const a = player("A", 0, 0, 0, ["B1", "B2"]);
    const standings = map(a, b1, b2, c, d);
    // OOMW% = (1.0 + 0.25) / 2 = 0.625
    expect(
      calculateOpponentOpponentMatchWinPercentage(a, standings),
    ).toBeCloseTo(0.625);
  });
});

// ---------------------------------------------------------------------------
// addTieBreakers
// ---------------------------------------------------------------------------

describe("addTieBreakers", () => {
  it("adds omw%, oomw%, and gwp% fields to every player", () => {
    const p = player("A", 2, 1, 0, [], {}, 4, 2);
    const [result] = addTieBreakers([p]);
    expect(result).toHaveProperty("opponentMatchWinPercentage");
    expect(result).toHaveProperty("opponentOpponentMatchWinPercentage");
    expect(result).toHaveProperty("gameWinPercentage");
  });

  it("calculates game win percentage correctly (gameWins / total games)", () => {
    const p = player("A", 2, 1, 0, [], {}, 4, 2); // 4 game wins, 2 game losses = 4/6
    const [result] = addTieBreakers([p]);
    expect(result.gameWinPercentage).toBeCloseTo(4 / 6);
  });

  it("returns 0 GWP for a player with no games recorded", () => {
    const p = player("A", 1, 0, 0); // gameWins/gameLosses both undefined
    const [result] = addTieBreakers([p]);
    expect(result.gameWinPercentage).toBe(0);
  });

  it("preserves all original player fields", () => {
    const p = player("A", 3, 0, 0);
    const [result] = addTieBreakers([p]);
    expect(result.id).toBe("A");
    expect(result.wins).toBe(3);
    expect(result.matchPoints).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// sortByTieBreakers
// ---------------------------------------------------------------------------

describe("sortByTieBreakers", () => {
  it("sorts by match points descending", () => {
    const a = player("A", 3, 0, 0); // 9 pts
    const b = player("B", 1, 2, 0); // 3 pts
    const c = player("C", 0, 3, 0); // 0 pts
    const sorted = sortByTieBreakers([c, b, a]);
    expect(sorted.map((p) => p.id)).toEqual(["A", "B", "C"]);
  });

  it("breaks match-point ties by OMW% (higher OMW% ranks first)", () => {
    // Both A and B have 3 match points (1 win each).
    // A played a strong opponent (100% win rate); B played a weak one (0%).
    // All four players are included so OMW% can be computed from the standings map.
    const strong = player("S", 3, 0, 0); // 1.0 win rate — A's opponent
    const weak = player("W", 0, 3, 0); //   0.0 win rate — B's opponent
    const a = player("A", 1, 0, 0, ["S"]);
    const b = player("B", 1, 0, 0, ["W"]);
    const sorted = sortByTieBreakers([b, a, strong, weak]);
    // S has 9 pts and comes first; among the tied 3-pt players, A (OMW%=1.0) beats B (OMW%=0.0)
    const aPos = sorted.findIndex((p) => p.id === "A");
    const bPos = sorted.findIndex((p) => p.id === "B");
    expect(aPos).toBeLessThan(bPos);
  });

  it("falls back to alphabetical name order when all tiebreakers are equal", () => {
    // Two players with identical stats and no opponents → every tiebreaker = 0
    const a = player("Alice", 1, 0, 0);
    const b = player("Bob", 1, 0, 0);
    const sorted = sortByTieBreakers([b, a]);
    expect(sorted[0].id).toBe("Alice");
    expect(sorted[1].id).toBe("Bob");
  });

  it("uses head-to-head when exactly two players are tied on all percentages", () => {
    // Zed and Amy each went 1-1 against the other (double round) → identical
    // match points and identical OMW%/OOMW%. Their most recent head-to-head
    // has Zed beating Amy, so Zed ranks first despite alphabetical order.
    const zed = player("Zed", 1, 1, 0, ["Amy", "Amy"], { Amy: "win" });
    const amy = player("Amy", 1, 1, 0, ["Zed", "Zed"], { Zed: "loss" });
    const sorted = sortByTieBreakers([amy, zed]);
    expect(sorted[0].id).toBe("Zed");
    expect(sorted[1].id).toBe("Amy");
  });

  it("does NOT apply head-to-head when three or more players are tied", () => {
    // Rock-paper-scissors: A beat B, B beat C, C beat A — all 1-1, identical
    // tiebreakers. Handbook: head-to-head only applies to exactly-two ties,
    // so the deterministic (alphabetical) order stands.
    const a = player("A", 1, 1, 0, ["B", "C"], { B: "win", C: "loss" });
    const b = player("B", 1, 1, 0, ["A", "C"], { A: "loss", C: "win" });
    const c = player("C", 1, 1, 0, ["A", "B"], { A: "win", B: "loss" });
    const sorted = sortByTieBreakers([c, b, a]);
    expect(sorted.map((p) => p.id)).toEqual(["A", "B", "C"]);
  });

  it("does not use game win percentage as a tiebreaker (not in the handbook)", () => {
    // Bob has a far better game record than Alice, but with all handbook
    // tiebreakers equal the order falls back to the deterministic name sort.
    const alice = player("Alice", 1, 0, 0, [], {}, 2, 2);
    const bob = player("Bob", 1, 0, 0, [], {}, 6, 0);
    const sorted = sortByTieBreakers([bob, alice]);
    expect(sorted[0].id).toBe("Alice");
  });

  it("produces a stable deterministic order across multiple calls", () => {
    const players = [
      player("C", 2, 1, 0),
      player("A", 2, 1, 0),
      player("B", 2, 1, 0),
    ];
    const first = sortByTieBreakers([...players]).map((p) => p.id);
    const second = sortByTieBreakers([...players]).map((p) => p.id);
    expect(first).toEqual(second);
  });
});
