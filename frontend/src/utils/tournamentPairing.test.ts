/**
 * Tournament pairing tests including stress test for Swiss invariants.
 */
import { describe, it, expect } from "vitest";
import {
  generateSwissPairings,
  calculateMatchPoints,
} from "./tournamentPairing";
import type { PlayerStanding, Pairing } from "./tournamentPairing";

/**
 * Deterministic RNG (so failures are reproducible)
 */
function mulberry32(seed: number) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStandingFromWLD(
  id: string,
  name: string,
  wins: number,
  losses: number,
  draws: number,
  byesReceived = 0,
  opponents: string[] = [],
): PlayerStanding {
  const matchPoints = calculateMatchPoints(wins, draws);
  const matchesPlayed = wins + losses + draws;

  return {
    id,
    name: `Player ${name}`,
    matchPoints,
    wins,
    losses,
    draws,
    matchesPlayed,
    opponents,
    byesReceived,
  };
}

function makeInitialStanding(id: string, name: string): PlayerStanding {
  return makeStandingFromWLD(id, name, 0, 0, 0, 0, []);
}

function assertRoundInvariants(
  result: { pairings: Pairing[] },
  standings: PlayerStanding[],
): void {
  const { pairings } = result;
  const n = standings.length;
  const expectedPairings = Math.ceil(n / 2);
  expect(pairings).toHaveLength(expectedPairings);

  const used = new Set<string>();

  let byeCount = 0;

  for (const p of pairings) {
    expect(p.player1Id).toBeTruthy();
    expect(p.player2Id).not.toBe(p.player1Id); // blocks self-pairing

    // player1 appears once
    expect(used.has(p.player1Id)).toBe(false);
    used.add(p.player1Id);

    if (p.player2Id === null) {
      byeCount++;
    } else {
      // player2 appears once
      expect(used.has(p.player2Id)).toBe(false);
      used.add(p.player2Id);
    }
  }

  // everyone appears exactly once
  expect(used.size).toBe(n);
  const standingsIds = new Set(standings.map((s) => s.id));
  for (const id of standingsIds) {
    expect(used.has(id)).toBe(true);
  }

  // correct bye count
  expect(byeCount).toBe(n % 2 === 1 ? 1 : 0);
}

function appendToHistory(
  history: Pairing[],
  roundPairings: Pairing[],
): Pairing[] {
  // Keep only real matches, no byes, and keep full history
  const next = [...history];
  for (const p of roundPairings) {
    if (p.player2Id) next.push(p);
  }
  return next;
}

function getByePairing(pairings: Pairing[]) {
  return pairings.find((p) => p.player2Id === null) ?? null;
}

function minMatchPoints(standings: PlayerStanding[]) {
  return Math.min(...standings.map((s) => s.matchPoints));
}

/**
 * Applies round results deterministically to create next-round standings.
 * - Bye counts as a win and increments byesReceived
 * - Random outcome per match using seeded RNG:
 *    0..0.45 => P1 win
 *    0.45..0.9 => P2 win
 *    0.9..1.0 => draw
 */
function simulateRoundResults(
  standings: PlayerStanding[],
  pairings: Pairing[],
  rng: () => number,
): PlayerStanding[] {
  const byStanding = new Map(
    standings.map((s) => [s.id, { ...s, opponents: [...s.opponents] }]),
  );

  for (const p of pairings) {
    if (!p.player2Id) {
      const s = byStanding.get(p.player1Id)!;
      s.wins += 1;
      s.matchesPlayed += 1;
      s.byesReceived += 1;
      s.matchPoints = calculateMatchPoints(s.wins, s.draws);
      continue;
    }

    const s1 = byStanding.get(p.player1Id)!;
    const s2 = byStanding.get(p.player2Id)!;

    s1.matchesPlayed += 1;
    s2.matchesPlayed += 1;
    s1.opponents.push(p.player2Id);
    s2.opponents.push(p.player1Id);

    const outcome = rng();
    if (outcome < 0.45) {
      s1.wins += 1;
      s2.losses += 1;
    } else if (outcome < 0.9) {
      s2.wins += 1;
      s1.losses += 1;
    } else {
      s1.draws += 1;
      s2.draws += 1;
    }

    s1.matchPoints = calculateMatchPoints(s1.wins, s1.draws);
    s2.matchPoints = calculateMatchPoints(s2.wins, s2.draws);
  }

  return Array.from(byStanding.values());
}

describe("generateSwissPairings", () => {
  it("round 1 with even players produces correct pairings", () => {
    const standings: PlayerStanding[] = [
      makeInitialStanding("a", "A"),
      makeInitialStanding("b", "B"),
      makeInitialStanding("c", "C"),
      makeInitialStanding("d", "D"),
    ];
    const result = generateSwissPairings(standings, 1, []);
    assertRoundInvariants(result, standings);
    expect(result.pairings).toHaveLength(2);
  });

  it("round 1 with odd players produces bye", () => {
    const standings: PlayerStanding[] = [
      makeInitialStanding("a", "A"),
      makeInitialStanding("b", "B"),
      makeInitialStanding("c", "C"),
    ];
    const result = generateSwissPairings(standings, 1, []);
    assertRoundInvariants(result, standings);
    const byePairing = getByePairing(result.pairings);
    expect(byePairing).not.toBeNull();
  });

  it("round 2 Test 2 case: four 3s, two 1s, three 0s - bye to 0-pointer", () => {
    // standings are consistent W/L/D -> matchPoints
    const standings: PlayerStanding[] = [
      makeStandingFromWLD("a", "A", 1, 0, 0),
      makeStandingFromWLD("b", "B", 1, 0, 0),
      makeStandingFromWLD("c", "C", 1, 0, 0),
      makeStandingFromWLD("d", "D", 1, 0, 0),
      makeStandingFromWLD("e", "E", 0, 0, 1),
      makeStandingFromWLD("f", "F", 0, 0, 1),
      makeStandingFromWLD("g", "G", 0, 1, 0),
      makeStandingFromWLD("h", "H", 0, 1, 0),
      makeStandingFromWLD("i", "I", 0, 1, 0),
    ];

    // Round 1 history (include bye record if you store it separately elsewhere; here we store only matches)
    const previousPairings: Pairing[] = [
      {
        player1Id: "a",
        player1Name: "A",
        player2Id: "b",
        player2Name: "B",
        roundNumber: 1,
      },
      {
        player1Id: "c",
        player1Name: "C",
        player2Id: "d",
        player2Name: "D",
        roundNumber: 1,
      },
      {
        player1Id: "e",
        player1Name: "E",
        player2Id: "f",
        player2Name: "F",
        roundNumber: 1,
      },
      {
        player1Id: "g",
        player1Name: "G",
        player2Id: "h",
        player2Name: "H",
        roundNumber: 1,
      },
      // i had a bye in round 1 (don’t include in previousPairings because generateSwissPairings uses previousPairings for rematches)
    ];

    const result = generateSwissPairings(standings, 2, previousPairings);
    assertRoundInvariants(result, standings);

    const byePairing = getByePairing(result.pairings);
    expect(byePairing).not.toBeNull();

    const byePlayer = standings.find((s) => s.id === byePairing!.player1Id)!;
    expect(byePlayer.matchPoints).toBe(0);
  });

  it("round 3: four at 3 pts pair without float when rematch is avoidable by re-pairing", () => {
    // User scenario: 2@6pts, 4@3pts, 2@0pts. The 4 at 3pts must pair as two 3v3 matches
    // by picking the permutation that has 0 rematches, instead of floating one down.
    // R1: a-b, c-d, e-f, g-h. Winners a,c,e,g (3pt). R2: a-c, e-g (3v3), b-d, f-h (0v0).
    // A and E win -> 6pt; C and G stay 3; B and F win -> 3pt. So 2@6 (a,e), 4@3 (c,g,b,f), 2@0 (d,h).
    // In R1 we had e-f so E and F played. So for 3pt group {c,g,b,f}: no one played each other in R1.
    // In R2 we had b-d, f-h so b and f didn't play c or g. So the only way to get a rematch in the 4
    // is if we arrange so two of {c,g,b,f} played in R2. So R2: a-c, e-b, g-f, d-h. Then a,e win (6).
    // c,b,g,f: c lost to a, b lost to e, g lost to f, f lost to g -> so b,c at 3 and g,f at 3. And d,h at 0.
    // So 3pt = c,b,g,f. In R2 we had g-f so G and F played. So naive top=[c,b] bottom=[g,f] gives c-g, b-f.
    // If that yields a rematch we need c-g or b-f to have played. They didn't. So we need one of the
    // two pairings to be rematch: e.g. have c and b play in R1 so naive c-g, b-f -> c and b didn't play g,f in R1.
    // So we need c-b as rematch. So in R1 we need c vs b: R1 a-b, c-d, e-f, g-h -> change to a-c, b-d, e-f, g-h.
    // Then a,c,e,g win (3pt). R2: a-e, c-g (3v3), b-f, d-h (0v0). A and C win (6). E and G stay 3. B and F win 3.
    // So 3pt = e,g,b,f. In R1 c and b didn't play (we had a-c, b-d). So in R2 we need two of e,g,b,f to have played.
    // R2 we have c-g and b-f. So e didn't play g,b,f. So we need e to play one of g,b,f in R1. R1 we had e-f. So e and f played.
    // So 3pt = e,g,b,f with e-f being a rematch. Sort by id: b,e,f,g. Top=[b,e], bottom=[f,g]. Naive: b-f, e-g.
    // b-f and e-g: e-g not played, b-f not played. So we need e-f (rematch) so we need top=[e,b] bottom=[f,g] -> e-f, b-g. So e-f is rematch. Swap to e-g, b-f -> both no rematch. So this works.
    const standings: PlayerStanding[] = [
      makeStandingFromWLD("a", "A", 2, 0, 0), // 6
      makeStandingFromWLD("c", "C", 2, 0, 0), // 6
      makeStandingFromWLD("e", "E", 1, 0, 0), // 3
      makeStandingFromWLD("g", "G", 1, 0, 0), // 3
      makeStandingFromWLD("b", "B", 1, 0, 0), // 3
      makeStandingFromWLD("f", "F", 1, 0, 0), // 3
      makeStandingFromWLD("d", "D", 0, 2, 0), // 0
      makeStandingFromWLD("h", "H", 0, 2, 0), // 0
    ];

    // R1: a-b, c-d, e-f, g-h. R2: a-e, c-g (3v3), b-d, f-h (0v0). So a,c=6; e,g,b,f=3; d,h=0. 6pt pair never met.
    const previousPairings: Pairing[] = [
      {
        player1Id: "a",
        player1Name: "A",
        player2Id: "b",
        player2Name: "B",
        roundNumber: 1,
      },
      {
        player1Id: "c",
        player1Name: "C",
        player2Id: "d",
        player2Name: "D",
        roundNumber: 1,
      },
      {
        player1Id: "e",
        player1Name: "E",
        player2Id: "f",
        player2Name: "F",
        roundNumber: 1,
      },
      {
        player1Id: "g",
        player1Name: "G",
        player2Id: "h",
        player2Name: "H",
        roundNumber: 1,
      },
      {
        player1Id: "a",
        player1Name: "A",
        player2Id: "e",
        player2Name: "E",
        roundNumber: 2,
      },
      {
        player1Id: "c",
        player1Name: "C",
        player2Id: "g",
        player2Name: "G",
        roundNumber: 2,
      },
      {
        player1Id: "b",
        player1Name: "B",
        player2Id: "d",
        player2Name: "D",
        roundNumber: 2,
      },
      {
        player1Id: "f",
        player1Name: "F",
        player2Id: "h",
        player2Name: "H",
        roundNumber: 2,
      },
    ];

    const result = generateSwissPairings(standings, 3, previousPairings);
    assertRoundInvariants(result, standings);

    const threePointIds = new Set(["e", "g", "b", "f"]);
    const zeroPointIds = new Set(["d", "h"]);

    const threeVsThree: Pairing[] = result.pairings.filter(
      (p) =>
        p.player2Id &&
        threePointIds.has(p.player1Id) &&
        threePointIds.has(p.player2Id),
    );
    const threeVsZero: Pairing[] = result.pairings.filter(
      (p) =>
        p.player2Id &&
        ((threePointIds.has(p.player1Id) && zeroPointIds.has(p.player2Id)) ||
          (zeroPointIds.has(p.player1Id) && threePointIds.has(p.player2Id))),
    );

    expect(threeVsThree).toHaveLength(2);
    expect(threeVsZero).toHaveLength(0);

    const havePlayedBefore = (id1: string, id2: string) =>
      previousPairings.some(
        (q) =>
          (q.player1Id === id1 && q.player2Id === id2) ||
          (q.player1Id === id2 && q.player2Id === id1),
      );
    for (const p of threeVsThree) {
      expect(havePlayedBefore(p.player1Id, p.player2Id!)).toBe(false);
    }
  });

  it("bye must always come from the minimum score bracket (when odd)", () => {
    const standings: PlayerStanding[] = [
      makeStandingFromWLD("a", "A", 2, 0, 0), // 6 pts
      makeStandingFromWLD("b", "B", 1, 0, 0), // 3 pts
      makeStandingFromWLD("c", "C", 1, 0, 0), // 3 pts
      makeStandingFromWLD("d", "D", 0, 1, 0), // 0 pts
      makeStandingFromWLD("e", "E", 0, 1, 0), // 0 pts
    ];

    const result = generateSwissPairings(standings, 3, []);
    assertRoundInvariants(result, standings);

    const bye = getByePairing(result.pairings);
    expect(bye).not.toBeNull();

    const byeStanding = standings.find((s) => s.id === bye!.player1Id)!;
    expect(byeStanding.matchPoints).toBe(minMatchPoints(standings));
  });

  it("stress test: multiple sizes and seeds; invariants always hold", () => {
    const sizes = [9, 17, 33];
    const seeds = [1, 2, 3, 10, 42, 99];
    const rounds = 200;

    for (const size of sizes) {
      for (const seed of seeds) {
        const rng = mulberry32(seed);

        const ids = Array.from({ length: size }, (_, i) => `p${i}`);
        let standings: PlayerStanding[] = ids.map((id) =>
          makeInitialStanding(id, id),
        );
        let previousPairings: Pairing[] = [];

        for (let round = 1; round <= rounds; round++) {
          const result = generateSwissPairings(
            standings,
            round,
            previousPairings,
          );
          assertRoundInvariants(result, standings);

          previousPairings = appendToHistory(previousPairings, result.pairings);
          standings = simulateRoundResults(standings, result.pairings, rng);
        }
      }
    }
  });
});
