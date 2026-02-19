import { describe, it, expect } from "vitest";
import { generateSwissPairings } from "./tournamentPairing";
import type { PlayerStanding, Pairing } from "./tournamentPairing";

function s(id: string, pts: number, byes = 0): PlayerStanding {
  const wins = Math.floor(pts / 3);
  const draws = pts % 3 === 1 ? 1 : 0;
  return {
    id,
    name: id,
    matchPoints: pts,
    wins,
    draws,
    losses: 0,
    matchesPlayed: wins + draws,
    opponents: [],
    byesReceived: byes,
  };
}

describe("float behaviour", () => {
  it("does not re-float the carryOver from a higher bracket when next bracket is mixed+odd", () => {
    // Brackets:
    // 3pt: 3 players (odd) -> one floats to 1pt bracket
    // 1pt: 2 players (even) but becomes 3 players with carryOver -> mixed+odd
    // Correct: float should come from 1pt subset, NOT the carryOver 3pt player.
    const standings: PlayerStanding[] = [
      s("A", 3),
      s("B", 3),
      s("C", 3), // 3pt (odd)
      s("D", 1),
      s("E", 1), // 1pt (becomes mixed+odd)
      s("F", 0),
      s("G", 0),
      s("H", 0),
      s("I", 0), // 0pt (even)
    ];

    const previous: Pairing[] = []; // not relevant for this test

    const { pairings, decisionLog } = generateSwissPairings(
      standings,
      2,
      previous,
    );

    // Find the float reasons; ensure the floated-from-mixed bracket is a 1pt player, not 3pt.
    const floatIds = [...(decisionLog?.floatReasons?.keys?.() ?? [])];

    // There should be at least one float (from 3pt bracket).
    expect(floatIds.length).toBeGreaterThan(0);

    // If there is a second float due to mixed+odd, it MUST be from 1pt subset.
    // We detect any "odd mixed bracket" message and verify that player has 1pt.
    const mixedFloat = floatIds.find((id) => {
      const reason = decisionLog?.floatReasons.get(id) ?? "";
      return reason.includes("odd mixed bracket");
    });

    if (mixedFloat) {
      const floated = standings.find((x) => x.id === mixedFloat)!;
      expect(floated.matchPoints).toBe(1);
    }

    // Sanity: still valid total pairing count
    expect(pairings.length).toBe(Math.ceil(standings.length / 2));
  });
});
