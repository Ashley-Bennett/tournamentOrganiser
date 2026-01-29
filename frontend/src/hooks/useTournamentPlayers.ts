import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import type { TournamentPlayer } from "../types/tournament";

export function useTournamentPlayers(tournamentId: string | undefined) {
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("tournament_players")
        .select("id, name, created_at")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: true });

      if (fetchError) {
        throw new Error(fetchError.message || "Failed to load players");
      }

      setPlayers((data as TournamentPlayer[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    void fetchPlayers();
  }, [tournamentId, fetchPlayers]);

  return {
    players,
    setPlayers,
    loading,
    error,
    setError,
    refetch: fetchPlayers,
  };
}
