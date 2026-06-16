import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import type { MatchReportRow } from "../types/match";

interface UseMatchReportsParams {
  tournamentId: string | undefined;
  setRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
}

export function useMatchReports({ tournamentId, setRefreshTrigger }: UseMatchReportsParams) {
  const [matchReports, setMatchReports] = useState<Map<string, MatchReportRow>>(new Map());

  useEffect(() => {
    if (!tournamentId) return;
    let isMounted = true;

    const fetchReports = async () => {
      const { data } = await supabase.rpc("get_match_result_reports", {
        p_tournament_id: tournamentId,
      });
      if (!isMounted) return;
      const map = new Map<string, MatchReportRow>();
      (data as MatchReportRow[] ?? []).forEach((r) => map.set(r.match_id, r));
      setMatchReports(map);
    };

    void fetchReports();

    const pollId = setInterval(() => void fetchReports(), 5_000);

    const channel = supabase
      .channel(`match-reports-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_result_reports" },
        () => { void fetchReports(); },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => { setRefreshTrigger((n) => n + 1); },
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, setRefreshTrigger]);

  return { matchReports };
}
