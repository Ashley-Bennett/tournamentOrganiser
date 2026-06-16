import type { PairingDecisionLog } from "../utils/tournamentPairing";

export interface TournamentPlayer {
  id: string;
  name: string;
  dropped: boolean;
  dropped_at_round: number | null;
  has_static_seating: boolean;
  static_seat_number: number | null;
  is_late_entry: boolean;
  late_entry_round: number | null;
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

export interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number | null;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  temp_winner_id: string | null;
  temp_result: string | null;
  pairings_published: boolean;
  status: "ready" | "pending" | "completed" | "bye";
  confirmed_by: "organiser" | "player_agreement" | "player_report" | "conflict" | null;
  pairing_decision_log?: PairingDecisionLog | null;
  created_at: string;
}

export interface MatchWithPlayers extends Match {
  player1_name: string;
  player2_name: string | null;
  winner_name: string | null;
}

export interface MatchReportRow {
  match_id: string;
  player1_id: string;
  player1_name: string;
  player2_id: string | null;
  player2_name: string | null;
  player1_report: string | null;
  player2_report: string | null;
  conflict_status: "agreed" | "conflict" | "partial";
}

export const MATCH_STATUS = {
  READY: "ready",
  PENDING: "pending",
  COMPLETED: "completed",
  BYE: "bye",
} as const;

export const humanizeByeReason = (reason: string): string => {
  if (reason.includes("dissolved rematch bracket"))
    return "their score group had no valid pairings";
  if (reason.includes("lowest bracket") || reason.includes("bye priority"))
    return "lowest score with the fewest previous byes";
  return reason;
};

export const humanizeFloatReason = (reason: string): string => {
  if (reason.includes("rematch-escape float"))
    return "moved to a different score group to avoid a rematch";
  if (reason.includes("odd mixed bracket") || reason.includes("odd bracket"))
    return "their score group had an odd number of players, so they played someone from the next group down";
  return reason;
};

export const serializeDecisionLog = (
  log: PairingDecisionLog | undefined,
): Record<string, unknown> | null => {
  if (!log) return null;
  return {
    ...log,
    floatReasons: Object.fromEntries(log.floatReasons),
  };
};

/**
 * Merges a pending result and a player-submitted report into the effective
 * winner/result shown in the UI. Pending result takes priority over a raw
 * report; the confirmed DB result takes priority over both.
 */
export const resolveEffectiveResult = (
  match: Match,
  pendingResult: { winnerId: string | null; result: string } | undefined,
  report: MatchReportRow | undefined,
): { effectiveWinnerId: string | null; effectiveResult: string | null } => {
  if (match.status === "completed" || match.status === "bye") {
    return { effectiveWinnerId: match.winner_id, effectiveResult: match.result };
  }
  if (pendingResult) {
    return { effectiveWinnerId: pendingResult.winnerId, effectiveResult: pendingResult.result };
  }
  if (report && report.conflict_status !== "conflict") {
    const outcome = report.player1_report ?? report.player2_report;
    const reporterId = report.player1_report ? report.player1_id : report.player2_id;
    if (outcome === "draw") {
      return { effectiveWinnerId: null, effectiveResult: "Draw" };
    } else if (outcome === "win") {
      return {
        effectiveWinnerId: reporterId,
        effectiveResult: reporterId === report.player1_id ? "1-0" : "0-1",
      };
    } else {
      const loserId = reporterId;
      const winnerId = loserId === report.player1_id ? report.player2_id : report.player1_id;
      return {
        effectiveWinnerId: winnerId,
        effectiveResult: loserId === report.player1_id ? "0-1" : "1-0",
      };
    }
  }
  return { effectiveWinnerId: null, effectiveResult: null };
};
