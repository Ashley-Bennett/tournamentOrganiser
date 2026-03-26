/**
 * Shared tournament types (Supabase schema).
 */

export interface TournamentSummary {
  id: string;
  name: string;
  status: string;
  tournament_type: "swiss" | "single_elimination";
  num_rounds: number | null;
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
  join_code?: string | null;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  created_at: string;
  has_static_seating?: boolean;
  static_seat_number?: number | null;
  user_id?: string | null;
  dropped?: boolean;
  dropped_at_round?: number | null;
  is_late_entry?: boolean;
  late_entry_round?: number | null;
  device_token?: string | null;
  device_id?: string | null;
  deck_pokemon1?: number | null;
  deck_pokemon2?: number | null;
}
