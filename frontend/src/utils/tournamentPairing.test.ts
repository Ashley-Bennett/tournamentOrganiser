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
