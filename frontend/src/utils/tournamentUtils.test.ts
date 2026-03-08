import { describe, it, expect } from "vitest";
import {
  buildStandingsFromMatches,
  calculateSuggestedRounds,
  assignMatchNumbers,
  getTournamentTypeLabel,
} from "./tournamentUtils";
import type { MatchForStandings } from "./tournamentUtils";
import type { Pairing } from "./tournamentPairing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function win(
  p1Id: string,
  p2Id: string,
  winnerId: string,
  result = "2-1",
): MatchForStandings {
  return {
    player1_id: p1Id,
    player2_id: p2Id,
    winner_id: winnerId,
    result,
    status: "completed",
    player1_name: p1Id,
    player2_name: p2Id,
  };
}

function draw(p1Id: string, p2Id: string): MatchForStandings {
  return {
    player1_id: p1Id,
    player2_id: p2Id,
    winner_id: null,
    result: "Draw",
    status: "completed",
    player1_name: p1Id,
    player2_name: p2Id,
  };
}

function bye(playerId: string): MatchForStandings {
  return {
    player1_id: playerId,
    player2_id: null,
    winner_id: null,
    result: null,
    status: "bye",
    player1_name: playerId,
    player2_name: null,
  };
}

function lateEntryLoss(playerId: string): MatchForStandings {
  return {
    player1_id: playerId,
    player2_id: null,
    winner_id: null,
    result: "loss",
    status: "completed",
    player1_name: playerId,
    player2_name: null,
  };
}

function incomplete(p1Id: string, p2Id: string): MatchForStandings {
  return {
    player1_id: p1Id,
    player2_id: p2Id,
    winner_id: null,
    result: null,
    status: "pending",
    player1_name: p1Id,
    player2_name: p2Id,
  };
}

function pairing(
  p1Id: string,
  p2Id: string | null,
  round = 1,
): Pairing {
  return {
    player1Id: p1Id,
    player1Name: p1Id,
    player2Id: p2Id,
    player2Name: p2Id,
    roundNumber: round,
  };
}

// ---------------------------------------------------------------------------
// getTournamentTypeLabel
// ---------------------------------------------------------------------------

describe("getTournamentTypeLabel", () => {
  it("labels swiss", () => expect(getTournamentTypeLabel("swiss")).toBe("Swiss"));
  it("labels single_elimination", () =>
    expect(getTournamentTypeLabel("single_elimination")).toBe(
      "Single Elimination",
    ));
  it("returns empty string for empty input", () =>
    expect(getTournamentTypeLabel("")).toBe(""));
  it("returns 'Swiss' for an unknown type (ternary fallback)", () =>
    expect(getTournamentTypeLabel("unknown")).toBe("Swiss"));
});

// ---------------------------------------------------------------------------
// calculateSuggestedRounds
// ---------------------------------------------------------------------------

describe("calculateSuggestedRounds", () => {
  describe("swiss", () => {
    it("returns 0 for less than 2 players", () => {
      expect(calculateSuggestedRounds(0, "swiss")).toBe(0);
      expect(calculateSuggestedRounds(1, "swiss")).toBe(0);
    });
    it("returns 3 for 2–8 players", () => {
      expect(calculateSuggestedRounds(2, "swiss")).toBe(3);
      expect(calculateSuggestedRounds(8, "swiss")).toBe(3);
    });
    it("returns 4 for 9–16 players", () => {
      expect(calculateSuggestedRounds(9, "swiss")).toBe(4);
      expect(calculateSuggestedRounds(16, "swiss")).toBe(4);
    });
    it("returns 5 for 17–32 players", () => {
      expect(calculateSuggestedRounds(17, "swiss")).toBe(5);
      expect(calculateSuggestedRounds(32, "swiss")).toBe(5);
    });
    it("returns 6 for 33–64 players", () => {
      expect(calculateSuggestedRounds(33, "swiss")).toBe(6);
      expect(calculateSuggestedRounds(64, "swiss")).toBe(6);
    });
    it("returns 7 for 65–128 players", () => {
      expect(calculateSuggestedRounds(65, "swiss")).toBe(7);
      expect(calculateSuggestedRounds(128, "swiss")).toBe(7);
    });
    it("returns 8 for 129–226 players", () => {
      expect(calculateSuggestedRounds(129, "swiss")).toBe(8);
      expect(calculateSuggestedRounds(226, "swiss")).toBe(8);
    });
    it("returns 9 for 227+ players", () => {
      expect(calculateSuggestedRounds(227, "swiss")).toBe(9);
      expect(calculateSuggestedRounds(512, "swiss")).toBe(9);
    });
  });

  describe("single_elimination", () => {
    it("returns 1 for 2 players (ceil(log2(2)) = 1)", () => {
      expect(calculateSuggestedRounds(2, "single_elimination")).toBe(1);
    });
    it("returns 2 for 4 players", () => {
      expect(calculateSuggestedRounds(4, "single_elimination")).toBe(2);
    });
    it("returns 3 for 8 players", () => {
      expect(calculateSuggestedRounds(8, "single_elimination")).toBe(3);
    });
    it("rounds up for non-power-of-2 player counts (e.g. 5 → 3)", () => {
      expect(calculateSuggestedRounds(5, "single_elimination")).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// buildStandingsFromMatches
// ---------------------------------------------------------------------------

describe("buildStandingsFromMatches", () => {
  it("returns an empty array when given no matches", () => {
    expect(buildStandingsFromMatches([])).toHaveLength(0);
  });

  it("seeds players from allPlayers even if they have no matches", () => {
    const allPlayers = [{ id: "A", name: "Alice" }, { id: "B", name: "Bob" }];
    const standings = buildStandingsFromMatches([], allPlayers);
    expect(standings).toHaveLength(2);
    expect(standings.every((p) => p.wins === 0 && p.losses === 0)).toBe(true);
  });

  it("seeds players from pending matches but does not update their stats", () => {
    // Players are seeded (so they appear in standings) but win/loss/draws stay 0.
    const standings = buildStandingsFromMatches([incomplete("A", "B")]);
    expect(standings).toHaveLength(2);
    expect(standings.every((p) => p.wins === 0 && p.losses === 0 && p.matchesPlayed === 0)).toBe(true);
  });

  describe("bye matches", () => {
    it("gives the player 1 win, 1 matchesPlayed, and 1 byesReceived", () => {
      const [p] = buildStandingsFromMatches([bye("A")]);
      expect(p.wins).toBe(1);
      expect(p.matchesPlayed).toBe(1);
      expect(p.byesReceived).toBe(1);
      expect(p.matchPoints).toBe(3);
    });

    it("does not add the player to their own opponents list", () => {
      const [p] = buildStandingsFromMatches([bye("A")]);
      expect(p.opponents).toHaveLength(0);
    });
  });

  describe("completed win matches", () => {
    it("gives the winner 1 win and the loser 1 loss", () => {
      const standings = buildStandingsFromMatches([win("A", "B", "A")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.wins).toBe(1);
      expect(a.losses).toBe(0);
      expect(b.wins).toBe(0);
      expect(b.losses).toBe(1);
    });

    it("adds each player to the other's opponents list", () => {
      const standings = buildStandingsFromMatches([win("A", "B", "A")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.opponents).toContain("B");
      expect(b.opponents).toContain("A");
    });

    it("tracks head-to-head opponentResults correctly", () => {
      const standings = buildStandingsFromMatches([win("A", "B", "A")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.opponentResults?.["B"]).toBe("win");
      expect(b.opponentResults?.["A"]).toBe("loss");
    });

    it("parses game scores from a result string like '2-1'", () => {
      const standings = buildStandingsFromMatches([win("A", "B", "A", "2-1")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.gameWins).toBe(2);
      expect(a.gameLosses).toBe(1);
      expect(b.gameWins).toBe(1);
      expect(b.gameLosses).toBe(2);
    });

    it("accumulates game scores across multiple matches", () => {
      const standings = buildStandingsFromMatches([
        win("A", "B", "A", "2-0"),
        win("A", "C", "A", "2-1"),
      ]);
      const a = standings.find((p) => p.id === "A")!;
      expect(a.gameWins).toBe(4); // 2 + 2
      expect(a.gameLosses).toBe(1); // 0 + 1
    });
  });

  describe("draw matches", () => {
    it("gives both players 1 draw and 1 match point each", () => {
      const standings = buildStandingsFromMatches([draw("A", "B")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.draws).toBe(1);
      expect(a.matchPoints).toBe(1);
      expect(b.draws).toBe(1);
      expect(b.matchPoints).toBe(1);
    });

    it("records draw in opponentResults for both players", () => {
      const standings = buildStandingsFromMatches([draw("A", "B")]);
      const a = standings.find((p) => p.id === "A")!;
      const b = standings.find((p) => p.id === "B")!;
      expect(a.opponentResults?.["B"]).toBe("draw");
      expect(b.opponentResults?.["A"]).toBe("draw");
    });
  });

  describe("late entry loss", () => {
    it("gives the player 1 loss and 1 matchesPlayed without an opponent", () => {
      const [p] = buildStandingsFromMatches([lateEntryLoss("A")]);
      expect(p.losses).toBe(1);
      expect(p.matchesPlayed).toBe(1);
      expect(p.opponents).toHaveLength(0);
      expect(p.byesReceived).toBe(0);
    });
  });

  it("handles a multi-round scenario correctly", () => {
    // Round 1: A beats B, C gets a bye
    // Round 2: A beats C
    const standings = buildStandingsFromMatches([
      win("A", "B", "A"),
      bye("C"),
      win("A", "C", "A"),
    ]);
    const a = standings.find((p) => p.id === "A")!;
    expect(a.wins).toBe(2);
    expect(a.matchesPlayed).toBe(2);
    expect(a.opponents).toEqual(expect.arrayContaining(["B", "C"]));
  });
});

// ---------------------------------------------------------------------------
// assignMatchNumbers
// ---------------------------------------------------------------------------

describe("assignMatchNumbers", () => {
  it("assigns sequential numbers starting at 1 when no static seats exist", () => {
    const pairings = [pairing("A", "B"), pairing("C", "D"), pairing("E", "F")];
    const result = assignMatchNumbers(pairings, new Map());
    expect(result.map((r) => r.matchNumber)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.warning === null)).toBe(true);
  });

  it("assigns a player's requested seat to their match", () => {
    const pairings = [pairing("A", "B"), pairing("C", "D")];
    // Player A wants table 3
    const seats = new Map([["A", 3]]);
    const result = assignMatchNumbers(pairings, seats);
    expect(result[0].matchNumber).toBe(3);
    expect(result[1].matchNumber).toBe(1); // next free sequential
  });

  it("uses the lower seat when both players in a pairing have static seats", () => {
    const pairings = [pairing("A", "B")];
    const seats = new Map([["A", 5], ["B", 3]]);
    const result = assignMatchNumbers(pairings, seats);
    expect(result[0].matchNumber).toBe(3); // lower seat wins
    expect(result[0].warning).toMatch(/Seat conflict/);
    expect(result[0].conflict).toBeDefined();
    expect(result[0].conflict?.resolvedSeat).toBe(3);
  });

  it("defers the second claim when two different pairings both want the same seat", () => {
    const pairings = [pairing("A", "B"), pairing("C", "D")];
    const seats = new Map([["A", 2], ["C", 2]]); // both want table 2
    const result = assignMatchNumbers(pairings, seats);
    const numbers = result.map((r) => r.matchNumber);
    // One gets 2, the other gets deferred to 1
    expect(numbers).toContain(2);
    expect(numbers).toContain(1);
    expect(new Set(numbers).size).toBe(2); // no duplicates
  });

  it("handles a bye pairing (player2Id = null) with a static seat", () => {
    const pairings = [pairing("A", null)];
    const seats = new Map([["A", 4]]);
    const result = assignMatchNumbers(pairings, seats);
    expect(result[0].matchNumber).toBe(4);
  });

  it("produces no duplicate table numbers", () => {
    const pairings = [
      pairing("A", "B"),
      pairing("C", "D"),
      pairing("E", "F"),
      pairing("G", "H"),
    ];
    const seats = new Map([["A", 3], ["G", 3]]); // collision
    const result = assignMatchNumbers(pairings, seats);
    const numbers = result.map((r) => r.matchNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
