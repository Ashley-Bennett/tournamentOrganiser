import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { type MatchWithPlayers, type MatchReportRow, MATCH_STATUS } from "../types/match";

interface UsePendingResultsParams {
  matches: MatchWithPlayers[];
  matchReports: Map<string, MatchReportRow>;
  refreshMatches: () => Promise<void>;
  setError: (error: string | null) => void;
  setUpdatingMatch: (updating: boolean) => void;
}

export function usePendingResults({
  matches,
  matchReports,
  refreshMatches,
  setError,
  setUpdatingMatch,
}: UsePendingResultsParams) {
  const [pendingResults, setPendingResults] = useState<
    Map<string, { winnerId: string | null; result: string }>
  >(new Map());
  const [autoSaveWarning, setAutoSaveWarning] = useState(false);
  const didRestoreRef = useRef(false);

  // Restore pending results from DB temp columns when matches first load
  useEffect(() => {
    if (matches.length === 0 || didRestoreRef.current) return;
    didRestoreRef.current = true;
    const toRestore = new Map<string, { winnerId: string | null; result: string }>();
    for (const match of matches) {
      if (
        match.status !== "completed" &&
        match.status !== "bye" &&
        match.temp_result
      ) {
        toRestore.set(match.id, {
          winnerId: match.temp_winner_id,
          result: match.temp_result,
        });
      }
    }
    if (toRestore.size > 0) setPendingResults(toRestore);
  }, [matches]);

  // Remove stale entries for matches that no longer exist
  useEffect(() => {
    if (matches.length === 0 || pendingResults.size === 0) return;
    const matchIds = new Set(matches.map((m) => m.id));
    const hasInvalidEntries = Array.from(pendingResults.keys()).some(
      (matchId) => !matchIds.has(matchId),
    );
    if (hasInvalidEntries) {
      setPendingResults((prev) => {
        const next = new Map<string, { winnerId: string | null; result: string }>();
        for (const [matchId, result] of prev.entries()) {
          if (matchIds.has(matchId)) next.set(matchId, result);
        }
        return next;
      });
    }
  }, [matches, pendingResults]);

  // Sync non-conflicting player-submitted reports into pendingResults
  useEffect(() => {
    if (matchReports.size === 0) return;
    setPendingResults((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [matchId, report] of matchReports.entries()) {
        if (report.conflict_status === "conflict") continue;
        const reportingOutcome = report.player1_report ?? report.player2_report;
        const reportingPlayerId = report.player1_report
          ? report.player1_id
          : report.player2_id;
        let winnerId: string | null = null;
        let result: string;
        if (reportingOutcome === "draw") {
          result = "Draw";
        } else if (reportingOutcome === "win") {
          winnerId = reportingPlayerId;
          result = reportingPlayerId === report.player1_id ? "1-0" : "0-1";
        } else {
          winnerId =
            reportingPlayerId === report.player1_id
              ? report.player2_id
              : report.player1_id;
          result = reportingPlayerId === report.player1_id ? "0-1" : "1-0";
        }
        const existing = prev.get(matchId);
        if (!existing || existing.result !== result || existing.winnerId !== winnerId) {
          next.set(matchId, { winnerId, result });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [matchReports]);

  const handleQuickResult = async (
    match: MatchWithPlayers,
    result: "player1" | "player2" | "draw",
  ) => {
    if (!match.player2_id) return;

    let winnerId: string | null = null;
    let resultString = "";

    if (result === "draw") {
      winnerId = null;
      resultString = "Draw";
    } else if (result === "player1") {
      winnerId = match.player1_id;
      resultString = "1-0";
    } else {
      winnerId = match.player2_id;
      resultString = "0-1";
    }

    setPendingResults((prev) => {
      const next = new Map(prev);
      next.set(match.id, { winnerId, result: resultString });
      return next;
    });

    const { error } = await supabase
      .from("tournament_matches")
      .update({ temp_winner_id: winnerId, temp_result: resultString })
      .eq("id", match.id);
    if (error) setAutoSaveWarning(true);
  };

  const savePendingResults = async (): Promise<void> => {
    if (pendingResults.size === 0) return;

    try {
      setUpdatingMatch(true);
      setError(null);

      const updates = Array.from(pendingResults.entries()).map(
        ([matchId, { winnerId, result }]) => ({
          id: matchId,
          winner_id: winnerId,
          result,
          status: MATCH_STATUS.COMPLETED,
        }),
      );

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from("tournament_matches")
          .update({
            winner_id: update.winner_id,
            result: update.result,
            status: update.status,
            temp_winner_id: null,
            temp_result: null,
          })
          .eq("id", update.id);

        if (updateError) {
          throw new Error(updateError.message || "Failed to update match");
        }
      }

      setPendingResults(new Map());
      await refreshMatches();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save results");
      throw e;
    } finally {
      setUpdatingMatch(false);
    }
  };

  return {
    pendingResults,
    setPendingResults,
    autoSaveWarning,
    setAutoSaveWarning,
    handleQuickResult,
    savePendingResults,
  };
}
