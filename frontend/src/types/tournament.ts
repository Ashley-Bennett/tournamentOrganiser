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
}

export interface TournamentPlayer {
  id: string;
  name: string;
  created_at: string;
  has_static_seating?: boolean;
  static_seat_number?: number | null;
}
