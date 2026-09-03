/**
 * Shared tournament types (Supabase schema).
 */

export interface TournamentSummary {
  id: string;
  name: string;
  status: string;
  tournament_type: "swiss" | "round_robin" | "single_elimination";
  num_rounds?: number | null;
  created_at: string;
  created_by: string;
  is_public?: boolean;
  public_slug?: string | null;
  round_duration_minutes?: number | null;
  current_round_started_at?: string | null;
  round_elapsed_seconds?: number | null;
  round_is_paused?: boolean | null;
  round_note?: string | null;
  join_enabled?: boolean;
  /** Players may add themselves from the join link while the tournament runs. */
  allow_late_join?: boolean;
  join_code?: string | null;
  starts_at?: string | null;
  /** Which game this event is for — see games/registry. */
  game_id?: string | null;
  /** Format code within that game (e.g. "standard"), or free text on older rows. */
  game_format?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  created_at: string;
  /** NULL for self-registered players (no organiser created the entry) */
  created_by?: string | null;
  has_static_seating?: boolean;
  static_seat_number?: number | null;
  user_id?: string | null;
  dropped?: boolean;
  dropped_at_round?: number | null;
  is_late_entry?: boolean;
  late_entry_round?: number | null;
  deck_pokemon1?: number | null;
  deck_pokemon2?: number | null;
}

/**
 * Narrow a selected `tournaments` row to `TournamentSummary`.
 *
 * `tournament_type` is CHECK-constrained text, so the generator reports it as
 * plain `string` while the union above is the real contract. Generic over the
 * selected columns, because the screens select different subsets and each
 * should keep its own shape rather than being widened to the whole row.
 */
export function toTournamentSummary<T extends { tournament_type: string }>(
  row: T,
): Omit<T, "tournament_type"> & {
  tournament_type: TournamentSummary["tournament_type"];
} {
  return row as Omit<T, "tournament_type"> & {
    tournament_type: TournamentSummary["tournament_type"];
  };
}
