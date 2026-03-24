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
        .select("id, name, created_at, has_static_seating, static_seat_number, user_id, dropped, dropped_at_round, is_late_entry, late_entry_round")
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

  // Realtime: pick up self-registrations and any external player changes
  useEffect(() => {
    if (!tournamentId) return;

    const channel = supabase
      .channel(`tournament_players:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tournament_players",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          setPlayers((prev) => {
            if (prev.some((p) => p.id === (payload.new as TournamentPlayer).id)) return prev;
            return [...prev, payload.new as TournamentPlayer];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournament_players",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === (payload.new as TournamentPlayer).id
                ? (payload.new as TournamentPlayer)
                : p,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  return {
    players,
    setPlayers,
    loading,
    error,
    setError,
    refetch: fetchPlayers,
  };
}
