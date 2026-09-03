import type { PairingDecisionLog } from "../utils/tournamentPairing";
import type { Database } from "./database";

/** A raw tournament_matches row, exactly as the generated schema describes it. */
export type MatchRow = Database["public"]["Tables"]["tournament_matches"]["Row"];

/**
 * The columns `toMatch` needs. Spelled out rather than taking the whole row so
 * that a partial select missing one of them fails to compile — the public
 * pairings page, for instance, selects everything here but not the decision
 * log, which is why that one is optional.
 */
export type MatchRowInput = Pick<
  MatchRow,
  | "id"
  | "tournament_id"
  | "round_number"
  | "match_number"
  | "player1_id"
  | "player2_id"
  | "winner_id"
  | "result"
  | "temp_winner_id"
  | "temp_result"
  | "pairings_published"
  | "status"
  | "confirmed_by"
  | "created_at"
> & { pairing_decision_log?: MatchRow["pairing_decision_log"] };

export interface TournamentPlayer {
  id: string;
  name: string;
  /** Set once the entry is linked to a player account. */
  user_id: string | null;
  dropped: boolean;
  dropped_at_round: number | null;
  has_static_seating: boolean;
  static_seat_number: number | null;
  is_late_entry: boolean;
  late_entry_round: number | null;
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
  /** Set when a player told the join page this entry is theirs and asked to be linked. */
  link_requested_at?: string | null;
}

/**
 * Every column the organiser screens need from tournament_players. Kept in one
 * place so a refresh after an edit cannot quietly return a narrower row and
 * blank out fields the UI is already showing.
 */
export const TOURNAMENT_PLAYER_COLUMNS =
  "id, name, user_id, dropped, dropped_at_round, has_static_seating, static_seat_number, is_late_entry, late_entry_round, deck_pokemon1, deck_pokemon2, link_requested_at";

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

/**
 * Narrow a raw row to the domain `Match`.
 *
 * `status` and `confirmed_by` are CHECK-constrained text columns, and
 * `pairing_decision_log` is jsonb — Postgres knows the allowed values but the
 * type generator can only report `string` and `Json`. The unions on `Match`
 * are the real contract, so this is the one place that assertion is made,
 * rather than at each of the call sites that used to cast a whole row.
 */
export function toMatch(row: MatchRowInput): Match {
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    round_number: row.round_number,
    match_number: row.match_number,
    player1_id: row.player1_id,
    player2_id: row.player2_id,
    winner_id: row.winner_id,
    result: row.result,
    temp_winner_id: row.temp_winner_id,
    temp_result: row.temp_result,
    pairings_published: row.pairings_published,
    status: row.status as Match["status"],
    confirmed_by: row.confirmed_by as Match["confirmed_by"],
    pairing_decision_log:
      (row.pairing_decision_log as PairingDecisionLog | null) ?? null,
    created_at: row.created_at,
  };
}

/** As `toMatch`, with the player names the organiser screens display. */
export function toMatchWithPlayers(
  row: MatchRowInput,
  nameOf: (id: string) => string,
): MatchWithPlayers {
  return {
    ...toMatch(row),
    player1_name: nameOf(row.player1_id),
    player2_name: row.player2_id ? nameOf(row.player2_id) : null,
    winner_name: row.winner_id ? nameOf(row.winner_id) : null,
  };
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

/**
 * A decision log on its way into jsonb.
 *
 * `floatReasons` is a Map, which is not JSON, so it becomes a plain object
 * here. The return type is the column's own type so an insert type-checks
 * without a cast at the call site.
 */
export const serializeDecisionLog = (
  log: PairingDecisionLog | undefined,
): MatchRow["pairing_decision_log"] => {
  if (!log) return null;
  return {
    ...log,
    floatReasons: Object.fromEntries(log.floatReasons),
  } as MatchRow["pairing_decision_log"];
};

/**
 * A decision log read off a `Match` on its way back into jsonb unchanged.
 *
 * Rows fetched from the database already hold the serialized shape — `toMatch`
 * only asserts the parsed type on the way out — so re-inserting one is the
 * mirror of that assertion rather than a new one.
 */
export const decisionLogToJson = (
  log: PairingDecisionLog | null | undefined,
): MatchRow["pairing_decision_log"] =>
  (log ?? null) as MatchRow["pairing_decision_log"];

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
