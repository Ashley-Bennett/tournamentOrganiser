import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import type { TournamentSummary } from "../types/tournament";
import type { User } from "@supabase/supabase-js";

export function useTournament(
  id: string | undefined,
  user: User | null,
  authLoading: boolean,
  workspaceId: string | null = null,
) {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTournament = useCallback(async () => {
    if (!id || !user) return;
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("tournaments")
        .select(
          "id, name, status, tournament_type, num_rounds, created_at, created_by",
        )
        .eq("id", id);

      // Scope to workspace when available (defence-in-depth on top of RLS)
      if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }

      const { data, error: fetchError } = await query.maybeSingle();

      if (fetchError) {
        throw new Error(fetchError.message || "Failed to load tournament");
      }
      if (!data) {
        setError("Tournament not found");
        setTournament(null);
      } else {
        setTournament(data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load tournament");
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [id, user, workspaceId]);

  useEffect(() => {
    if (!id) {
      setError("Missing tournament id");
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) return;

    void fetchTournament();
  }, [id, user, authLoading, fetchTournament]);

  return {
    tournament,
    setTournament,
    loading,
    error,
    setError,
    refetch: fetchTournament,
  };
}
