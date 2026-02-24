/**
 * Tournament display and setup helpers.
 */

import { calculateMatchPoints, type PlayerStanding, type Pairing } from "./tournamentPairing";

/** Minimal match shape required by buildStandingsFromMatches */
export interface MatchForStandings {
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  status: string;
  player1_name: string;
  player2_name: string | null;
}

/**
 * Build a PlayerStanding map from a list of completed/bye matches.
 *
 * @param matches       All matches to process (incomplete ones are skipped).
 * @param allPlayers    Optional explicit player list — used when some players
 *                      may not appear in any match yet (e.g. round-generation).
 *                      If omitted, players are seeded from the matches array.
 */
export function buildStandingsFromMatches(
  matches: MatchForStandings[],
  allPlayers?: { id: string; name: string }[],
): PlayerStanding[] {
  const standingsMap = new Map<string, PlayerStanding>();

  const seed = (id: string, name: string) => {
    if (!standingsMap.has(id)) {
      standingsMap.set(id, {
        id,
        name,
        matchPoints: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        opponents: [],
        byesReceived: 0,
        opponentResults: {},
        gameWins: 0,
        gameLosses: 0,
      });
    }
  };

  if (allPlayers) {
    for (const p of allPlayers) seed(p.id, p.name);
  }

  for (const m of matches) {
    seed(m.player1_id, m.player1_name);
    if (m.player2_id) seed(m.player2_id, m.player2_name ?? "Unknown");
  }

  for (const match of matches) {
    const isBye = match.status === "bye" || !match.player2_id;
    const isDraw =
      match.status === "completed" &&
      match.winner_id === null &&
      match.result === "Draw";
    const isCompletedWin =
      match.status === "completed" &&
      match.winner_id !== null &&
      match.result !== "Draw";

    if (!isBye && !isDraw && !isCompletedWin) continue;

    const p1 = standingsMap.get(match.player1_id);
    const p2 = match.player2_id ? standingsMap.get(match.player2_id) : null;

    // Parse game scores from result string (e.g. "2-1")
    const scoreParts = match.result?.match(/^(\d+)-(\d+)$/);
    const p1GameWins = scoreParts ? parseInt(scoreParts[1]!, 10) : 0;
    const p2GameWins = scoreParts ? parseInt(scoreParts[2]!, 10) : 0;

    if (p1) {
      p1.matchesPlayed++;
      if (isBye) {
        p1.byesReceived++;
        p1.wins++;
      } else if (isDraw) {
        p1.draws++;
        if (match.player2_id) {
          p1.opponents.push(match.player2_id);
          if (p1.opponentResults) p1.opponentResults[match.player2_id] = "draw";
        }
      } else if (isCompletedWin) {
        if (match.winner_id === match.player1_id) {
          p1.wins++;
          if (match.player2_id && p1.opponentResults)
            p1.opponentResults[match.player2_id] = "win";
        } else {
          p1.losses++;
          if (match.player2_id && p1.opponentResults)
            p1.opponentResults[match.player2_id] = "loss";
        }
        if (match.player2_id) p1.opponents.push(match.player2_id);
        if (scoreParts) {
          p1.gameWins = (p1.gameWins ?? 0) + p1GameWins;
          p1.gameLosses = (p1.gameLosses ?? 0) + p2GameWins;
        }
      }
      p1.matchPoints = calculateMatchPoints(p1.wins, p1.draws);
    }

    if (p2) {
      p2.matchesPlayed++;
      if (isDraw) {
        p2.draws++;
        p2.opponents.push(match.player1_id);
        if (p2.opponentResults) p2.opponentResults[match.player1_id] = "draw";
      } else if (isCompletedWin) {
        if (match.winner_id === match.player2_id) {
          p2.wins++;
          if (p2.opponentResults) p2.opponentResults[match.player1_id] = "win";
        } else {
          p2.losses++;
          if (p2.opponentResults) p2.opponentResults[match.player1_id] = "loss";
        }
        p2.opponents.push(match.player1_id);
        if (scoreParts) {
          p2.gameWins = (p2.gameWins ?? 0) + p2GameWins;
          p2.gameLosses = (p2.gameLosses ?? 0) + p1GameWins;
        }
      }
      p2.matchPoints = calculateMatchPoints(p2.wins, p2.draws);
    }
  }

  return Array.from(standingsMap.values());
}

export function getTournamentTypeLabel(type: string): string {
  if (!type) return "";
  return type === "single_elimination" ? "Single Elimination" : "Swiss";
}

/**
 * Suggested number of rounds based on player count and tournament type.
 */
export function calculateSuggestedRounds(
  playerCount: number,
  tournamentType: string,
): number {
  if (playerCount < 2) return 0;

  if (tournamentType === "single_elimination") {
    return Math.ceil(Math.log2(playerCount));
  }

  // Swiss: standard bracket thresholds (Pokémon/MTG tournament rules)
  if (playerCount <= 8) return 3;
  if (playerCount <= 16) return 4;
  if (playerCount <= 32) return 5;
  if (playerCount <= 64) return 6;
  if (playerCount <= 128) return 7;
  if (playerCount <= 226) return 8;
  return 9;
}

export interface SeatAssignment {
  matchNumber: number;
  warning: string | null;
}

/**
 * Assign match (table) numbers to a list of pairings, honouring static seat requests.
 *
 * - Players with a static seat number always play at that table.
 * - When two statically-seated players face each other, the lower seat number wins.
 * - Seat numbers apply to bye matches too.
 * - Colliding static-seat claims (two separate matches both wanting the same number)
 *   are resolved by deferring the later claim to the next free sequential number.
 * - All remaining pairings receive sequential numbers, skipping reserved ones.
 */
export function assignMatchNumbers(
  pairings: Pairing[],
  staticSeats: Map<string, number>, // playerId → seatNumber
): SeatAssignment[] {
  const result: (SeatAssignment | null)[] = new Array(pairings.length).fill(null);
  const taken = new Set<number>();
  const deferred: number[] = [];

  for (let i = 0; i < pairings.length; i++) {
    const p = pairings[i];
    const s1 = staticSeats.get(p.player1Id);
    const s2 = p.player2Id ? staticSeats.get(p.player2Id) : undefined;

    if (s1 !== undefined || s2 !== undefined) {
      let target: number;
      let warning: string | null = null;

      if (s1 !== undefined && s2 !== undefined) {
        // Both players have a static seat — lower number wins
        target = Math.min(s1, s2);
        warning = `Seat conflict: ${p.player1Name} (table ${s1}) vs ${p.player2Name} (table ${s2}) — using table ${target}`;
      } else {
        target = s1 ?? s2!;
      }

      if (taken.has(target)) {
        // Another statically-seated pairing already claimed this number — defer
        deferred.push(i);
      } else {
        taken.add(target);
        result[i] = { matchNumber: target, warning };
      }
    } else {
      deferred.push(i);
    }
  }

  // Fill deferred pairings with the next available sequential numbers
  let next = 1;
  for (const i of deferred) {
    while (taken.has(next)) next++;
    taken.add(next);
    result[i] = { matchNumber: next, warning: null };
    next++;
  }

  return result as SeatAssignment[];
}
