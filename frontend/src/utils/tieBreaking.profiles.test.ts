/**
 * Rules-profile behaviour of the tie-break library.
 *
 * The Pokémon chain is covered by tieBreaking.test.ts; this file covers what
 * changes when a tournament is scored under a different profile.
 */

import { describe, it, expect } from "vitest";
import {
  calculateBuchholz,
  calculateWinPercentage,
  sortByProfile,
  sortByTieBreakers,
  type PlayerStanding,
} from "./tieBreaking";
import { calculateMatchPoints } from "./tournamentPairing";
import { GENERIC_RULES, POKEMON_RULES } from "../games/rules";

function player(
  id: string,
  name: string,
  over: Partial<PlayerStanding> = {},
): PlayerStanding {
  return {
    id,
    name,
    matchPoints: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchesPlayed: 0,
    opponents: [],
    byesReceived: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Win percentage bounds
// ---------------------------------------------------------------------------

describe("calculateWinPercentage — profile bounds", () => {
  it("floors a winless record at 25% for Pokémon but not for generic", () => {
    const record = { wins: 0, matchesPlayed: 3 };
    expect(calculateWinPercentage(record, false, POKEMON_RULES.winPct)).toBe(0.25);
    expect(calculateWinPercentage(record, false, GENERIC_RULES.winPct)).toBe(0);
  });

  it("caps a dropped player at 75% for Pokémon but not for generic", () => {
    const record = { wins: 3, matchesPlayed: 3 };
    expect(calculateWinPercentage(record, true, POKEMON_RULES.winPct)).toBe(0.75);
    expect(calculateWinPercentage(record, true, GENERIC_RULES.winPct)).toBe(1);
  });

  it("excludes byes for Pokémon and counts them plainly for generic", () => {
    const record = { wins: 1, matchesPlayed: 2, byesReceived: 1 };
    // Pokémon: the bye round is removed entirely, leaving 0 wins from 1 round.
    expect(calculateWinPercentage(record, false, POKEMON_RULES.winPct)).toBe(0.25);
    // Generic: 1 win from 2 rounds.
    expect(calculateWinPercentage(record, false, GENERIC_RULES.winPct)).toBe(0.5);
  });

  it("defaults to Pokémon bounds when no profile is given", () => {
    const record = { wins: 0, matchesPlayed: 3 };
    expect(calculateWinPercentage(record, false)).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// Buchholz
// ---------------------------------------------------------------------------

describe("calculateBuchholz", () => {
  const field = new Map<string, PlayerStanding>([
    ["b", player("b", "B", { matchPoints: 9 })],
    ["c", player("c", "C", { matchPoints: 3 })],
  ]);

  it("sums the match points of everyone faced", () => {
    const a = player("a", "A", { opponents: ["b", "c"] });
    expect(calculateBuchholz(a, field)).toBe(12);
  });

  it("is zero for a player who has not been paired yet", () => {
    expect(calculateBuchholz(player("a", "A"), field)).toBe(0);
  });

  it("ignores an opponent whose entry has since been deleted", () => {
    const a = player("a", "A", { opponents: ["b", "ghost"] });
    expect(calculateBuchholz(a, field)).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Ranking under each profile
// ---------------------------------------------------------------------------

describe("sortByProfile", () => {
  /**
   * Alice and Bob are level on match points and have faced opponents worth the
   * same match points, so Buchholz cannot separate them — but Alice's
   * opponents drew everything while Bob's won and lost, so their win
   * percentages differ and OMW% can.
   */
  function drawHeavyField(): PlayerStanding[] {
    return [
      player("alice", "Alice", { matchPoints: 3, wins: 1, losses: 1, matchesPlayed: 2, opponents: ["d1", "d2"] }),
      player("bob", "Bob", { matchPoints: 3, wins: 1, losses: 1, matchesPlayed: 2, opponents: ["e1", "e2"] }),
      // 0 wins, 3 draws — 3 match points, 0% win rate
      player("d1", "D1", { matchPoints: 3, draws: 3, matchesPlayed: 3 }),
      player("d2", "D2", { matchPoints: 3, draws: 3, matchesPlayed: 3 }),
      // 1 win, 2 losses — 3 match points, 33% win rate
      player("e1", "E1", { matchPoints: 3, wins: 1, losses: 2, matchesPlayed: 3 }),
      player("e2", "E2", { matchPoints: 3, wins: 1, losses: 2, matchesPlayed: 3 }),
    ];
  }

  it("ranks by OMW% under Pokémon rules", () => {
    const sorted = sortByProfile(drawHeavyField(), POKEMON_RULES);
    const top = sorted.filter((p) => p.id === "alice" || p.id === "bob");
    expect(top.map((p) => p.id)).toEqual(["bob", "alice"]);
  });

  it("ranks by Buchholz under generic rules, which reads the same field differently", () => {
    const sorted = sortByProfile(drawHeavyField(), GENERIC_RULES);
    const top = sorted.filter((p) => p.id === "alice" || p.id === "bob");
    // Buchholz is level at 6 apiece, so the alphabetical fallback decides —
    // generic Swiss does not consider the win rate that separates them above.
    expect(top.map((p) => p.id)).toEqual(["alice", "bob"]);
    expect(top.every((p) => p.buchholz === 6)).toBe(true);
  });

  it("separates players by Buchholz when they faced different fields", () => {
    const standings = [
      player("hard", "Hard", { matchPoints: 3, wins: 1, losses: 1, matchesPlayed: 2, opponents: ["strong", "strong2"] }),
      player("easy", "Easy", { matchPoints: 3, wins: 1, losses: 1, matchesPlayed: 2, opponents: ["weak", "weak2"] }),
      player("strong", "Strong", { matchPoints: 9, wins: 3, matchesPlayed: 3 }),
      player("strong2", "Strong2", { matchPoints: 9, wins: 3, matchesPlayed: 3 }),
      player("weak", "Weak", { matchPoints: 0, losses: 3, matchesPlayed: 3 }),
      player("weak2", "Weak2", { matchPoints: 0, losses: 3, matchesPlayed: 3 }),
    ];
    const sorted = sortByProfile(standings, GENERIC_RULES);
    const tied = sorted.filter((p) => p.id === "hard" || p.id === "easy");
    expect(tied.map((p) => p.id)).toEqual(["hard", "easy"]);
  });

  it("still breaks an exact tie on head-to-head under generic rules", () => {
    const standings = [
      player("amy", "Amy", {
        matchPoints: 3,
        wins: 1,
        losses: 1,
        matchesPlayed: 2,
        opponents: ["zed"],
        opponentResults: { zed: "loss" },
      }),
      player("zed", "Zed", {
        matchPoints: 3,
        wins: 1,
        losses: 1,
        matchesPlayed: 2,
        opponents: ["amy"],
        opponentResults: { amy: "win" },
      }),
    ];
    const sorted = sortByProfile(standings, GENERIC_RULES);
    // Zed beat Amy, so Zed ranks above despite losing the alphabetical fallback.
    expect(sorted.map((p) => p.id)).toEqual(["zed", "amy"]);
  });

  it("keeps dropped players at the bottom under generic rules", () => {
    const standings = [
      player("dropped", "Dropped", { matchPoints: 9, wins: 3, matchesPlayed: 3 }),
      player("active", "Active", { matchPoints: 3, wins: 1, matchesPlayed: 3 }),
    ];
    const sorted = sortByProfile(standings, GENERIC_RULES, new Set(["dropped"]));
    expect(sorted.map((p) => p.id)).toEqual(["active", "dropped"]);
  });

  it("is what sortByTieBreakers delegates to for Pokémon", () => {
    const standings = drawHeavyField();
    expect(sortByTieBreakers(standings).map((p) => p.id)).toEqual(
      sortByProfile(drawHeavyField(), POKEMON_RULES).map((p) => p.id),
    );
  });
});

// ---------------------------------------------------------------------------
// Match points
// ---------------------------------------------------------------------------

describe("calculateMatchPoints — profile points", () => {
  it("awards 3 for a win and 1 for a draw under both 1.0 profiles", () => {
    expect(calculateMatchPoints(2, 1, POKEMON_RULES)).toBe(7);
    expect(calculateMatchPoints(2, 1, GENERIC_RULES)).toBe(7);
  });

  it("defaults to Pokémon points when no profile is given", () => {
    expect(calculateMatchPoints(2, 1)).toBe(7);
  });
});
