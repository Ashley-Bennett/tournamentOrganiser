/**
 * Shared tournament types (Supabase schema).
 */

export interface TournamentSummary {
  id: string;
  name: string;
  status: string;
  tournament_type: "swiss" | "single_elimination";
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
