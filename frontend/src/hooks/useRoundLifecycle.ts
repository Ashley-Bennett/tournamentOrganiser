import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import {
  generateSwissPairings,
  type Pairing,
} from "../utils/tournamentPairing";
import {
  buildStandingsFromMatches,
  assignMatchNumbers,
  type SeatConflict,
} from "../utils/tournamentUtils";
import {
  MATCH_STATUS,
  serializeDecisionLog,
  type Match,
  type MatchWithPlayers,
} from "../types/match";
import type { TournamentSummary } from "../types/tournament";

interface UseRoundLifecycleParams {
  tournament: TournamentSummary | null;
  setTournament: Dispatch<SetStateAction<TournamentSummary | null>>;
  matches: MatchWithPlayers[];
  setMatches: Dispatch<SetStateAction<MatchWithPlayers[]>>;
  selectedRound: number | "standings";
  setSelectedRound: Dispatch<SetStateAction<number | "standings">>;
  workspaceId: string | null | undefined;
  user: User | null;
  savePendingResults: () => Promise<void>;
  refreshMatches: () => Promise<void>;
  setError: (error: string | null) => void;
  setSavingTimer: Dispatch<SetStateAction<boolean>>;
  setTimerEditorOpen: Dispatch<SetStateAction<boolean>>;
}

export function useRoundLifecycle({
  tournament,
  setTournament,
  matches,
  setMatches,
  selectedRound,
  setSelectedRound,
  workspaceId,
  user,
  savePendingResults,
  refreshMatches,
  setError,
  setSavingTimer,
  setTimerEditorOpen,
}: UseRoundLifecycleParams) {
  const [processingRound, setProcessingRound] = useState(false);
  const [seatWarnings, setSeatWarnings] = useState<string[]>([]);

  const handleBeginRound = async () => {
    if (!tournament || !user) return;
    if (tournament.current_round_started_at) return;

    try {
      setProcessingRound(true);
      setError(null);
      if (typeof selectedRound !== "number") return;

      // Record the absolute start time on the tournament FIRST, before match
      // transitions. This ensures any re-fetch triggered by the realtime subscription
      // (fired when matches update below) reads the timer state from DB rather than
      // overwriting local state with stale null data.
      if (tournament.round_duration_minutes) {
        const startedAt = new Date().toISOString();
        const { error: timerError } = await supabase
          .from("tournaments")
          .update({
            current_round_started_at: startedAt,
            round_elapsed_seconds: 0,
            round_is_paused: false,
          })
          .eq("id", tournament.id);
        if (!timerError) {
          setTournament({
            ...tournament,
            current_round_started_at: startedAt,
            round_elapsed_seconds: 0,
            round_is_paused: false,
          });
        }
      }

      // Auto-complete any bye matches (player2_id is null) that are still "ready".
      // Byes are created as "ready" so the organiser can edit pairings; we finalise
      // them here when the round officially starts.
      const readyByeMatches = matches.filter(
        (m) =>
          m.round_number === selectedRound &&
          m.status === MATCH_STATUS.READY &&
          !m.player2_id,
      );
      for (const byeMatch of readyByeMatches) {
        const { error: byeError } = await supabase
          .from("tournament_matches")
          .update({
            status: MATCH_STATUS.BYE,
            result: "bye",
            winner_id: byeMatch.player1_id,
          })
          .eq("id", byeMatch.id);
        if (byeError)
          throw new Error(byeError.message || "Failed to complete bye match");
      }

      // Transition all remaining "ready" matches (real matches) to "pending"
      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update({ status: MATCH_STATUS.PENDING })
        .eq("tournament_id", tournament.id)
        .eq("round_number", selectedRound)
        .eq("status", MATCH_STATUS.READY);

      if (updateError) {
        throw new Error(updateError.message || "Failed to begin round");
      }

      await refreshMatches();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to begin round");
    } finally {
      setProcessingRound(false);
    }
  };

  const handlePauseTimer = async () => {
    if (!tournament || !tournament.round_duration_minutes) return;
    if (!tournament.current_round_started_at || tournament.round_is_paused) return;
    const elapsed =
      (tournament.round_elapsed_seconds ?? 0) +
      Math.floor(
        (Date.now() - new Date(tournament.current_round_started_at).getTime()) / 1_000,
      );
    const { error } = await supabase
      .from("tournaments")
      .update({
        current_round_started_at: null,
        round_elapsed_seconds: elapsed,
        round_is_paused: true,
      })
      .eq("id", tournament.id);
    if (!error) {
      setTournament({
        ...tournament,
        current_round_started_at: null,
        round_elapsed_seconds: elapsed,
        round_is_paused: true,
      });
    }
  };

  const handleResumeTimer = async () => {
    if (!tournament || !tournament.round_duration_minutes) return;
    if (!tournament.round_is_paused) return;
    const resumedAt = new Date().toISOString();
    const { error } = await supabase
      .from("tournaments")
      .update({ current_round_started_at: resumedAt, round_is_paused: false })
      .eq("id", tournament.id);
    if (!error) {
      setTournament({
        ...tournament,
        current_round_started_at: resumedAt,
        round_is_paused: false,
      });
    }
  };

  const handleSetRoundDuration = async (minutes: number | null) => {
    if (!tournament || !workspaceId) return;
    setSavingTimer(true);
    // If enabling a timer on an active round that never had one, start it paused
    // so the organiser can resume when ready rather than counting from an unknown point.
    const addingToActiveRound =
      minutes !== null &&
      tournament.status === "active" &&
      !tournament.current_round_started_at &&
      !tournament.round_is_paused;
    const payload =
      minutes === null
        ? {
            round_duration_minutes: null as number | null,
            current_round_started_at: null as string | null,
            round_elapsed_seconds: 0,
            round_is_paused: false,
          }
        : {
            round_duration_minutes: minutes,
            ...(addingToActiveRound
              ? {
                  current_round_started_at: null as string | null,
                  round_elapsed_seconds: 0,
                  round_is_paused: true,
                }
              : {}),
          };
    const { error } = await supabase
      .from("tournaments")
      .update(payload)
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    setSavingTimer(false);
    if (!error) {
      setTournament({
        ...tournament,
        round_duration_minutes: minutes,
        ...(minutes === null
          ? { current_round_started_at: null, round_elapsed_seconds: 0, round_is_paused: false }
          : addingToActiveRound
            ? { current_round_started_at: null, round_elapsed_seconds: 0, round_is_paused: true }
            : {}),
      });
      if (minutes === null) setTimerEditorOpen(false);
    }
  };

  const handleSaveRoundNote = async (note: string) => {
    if (!tournament || !workspaceId) return;
    const trimmed = note.trim();
    const { error } = await supabase
      .from("tournaments")
      .update({ round_note: trimmed || null })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    if (!error) {
      setTournament({ ...tournament, round_note: trimmed || null });
    }
  };

  const handlePublishPairings = async () => {
    if (!tournament || typeof selectedRound !== "number") return;
    try {
      setProcessingRound(true);
      setError(null);
      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update({ pairings_published: true })
        .eq("tournament_id", tournament.id)
        .eq("round_number", selectedRound)
        .eq("status", MATCH_STATUS.READY);
      if (updateError)
        throw new Error(updateError.message || "Failed to publish pairings");
      // Optimistically mark the published matches in local state so the Begin Round
      // button appears immediately, without waiting for the refreshMatches round-trip.
      setMatches((prev) =>
        prev.map((m) =>
          m.round_number === selectedRound && m.status === MATCH_STATUS.READY
            ? { ...m, pairings_published: true }
            : m,
        ),
      );
      setProcessingRound(false);
      void refreshMatches();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to publish pairings");
    } finally {
      setProcessingRound(false);
    }
  };

  const handleCompleteTournament = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      await savePendingResults();

      const { error: updateError } = await supabase
        .from("tournaments")
        .update({
          status: "completed",
          current_round_started_at: null,
          round_elapsed_seconds: 0,
          round_is_paused: false,
        })
        .eq("id", tournament.id)
        .eq("workspace_id", workspaceId ?? "");

      if (updateError) {
        throw new Error(updateError.message || "Failed to complete tournament");
      }

      setTournament({
        ...tournament,
        status: "completed",
        current_round_started_at: null,
        round_elapsed_seconds: 0,
        round_is_paused: false,
      });
      setSelectedRound("standings");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to complete tournament");
    } finally {
      setProcessingRound(false);
    }
  };

  const handleRegenerateRound1 = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);
      setSeatWarnings([]);

      const { data: playersData, error: playersError } = await supabase
        .from("tournament_players")
        .select("id, name, has_static_seating, static_seat_number")
        .eq("tournament_id", tournament.id)
        .order("created_at", { ascending: true });

      if (playersError) {
        throw new Error(playersError.message || "Failed to load players");
      }

      if (!playersData || playersData.length < 2) {
        throw new Error("Tournament needs at least 2 players");
      }

      const standings = playersData.map((p) => ({
        id: p.id,
        name: p.name,
        matchPoints: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        opponents: [],
        byesReceived: 0,
      }));

      const pairingResult = generateSwissPairings(standings, 1, []);

      if (!pairingResult.pairings || pairingResult.pairings.length === 0) {
        throw new Error("Failed to generate pairings");
      }

      const { error: deleteError } = await supabase
        .from("tournament_matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("round_number", 1);

      if (deleteError) {
        throw new Error(deleteError.message || "Failed to delete existing round 1 matches");
      }

      const staticSeatsR1 = new Map<string, number>();
      playersData.forEach((p) => {
        if (p.has_static_seating && p.static_seat_number != null) {
          staticSeatsR1.set(p.id, p.static_seat_number);
        }
      });
      const seatAssignmentsR1 = assignMatchNumbers(pairingResult.pairings, staticSeatsR1);
      const seatWarningsR1 = seatAssignmentsR1.map((a) => a.warning).filter(Boolean) as string[];
      setSeatWarnings(seatWarningsR1);

      const seatConflictsR1 = seatAssignmentsR1.map((a) => a.conflict).filter(Boolean) as SeatConflict[];
      if (seatConflictsR1.length > 0 && pairingResult.decisionLog) {
        pairingResult.decisionLog.seatConflicts = seatConflictsR1;
      }

      const matchesToInsert = pairingResult.pairings.map((pairing, index) => ({
        tournament_id: tournament.id,
        workspace_id: workspaceId,
        round_number: 1,
        match_number: seatAssignmentsR1[index].matchNumber,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: MATCH_STATUS.READY,
        result: null,
        winner_id: null,
        pairing_decision_log:
          index === 0 ? serializeDecisionLog(pairingResult.decisionLog) : null,
      }));

      const { error: insertError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert);

      if (insertError) {
        throw new Error(insertError.message || "Failed to create round 1 matches");
      }

      await refreshMatches();
      setSelectedRound(1);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to regenerate round 1 pairings",
      );
    } finally {
      setProcessingRound(false);
    }
  };

  const handleAddRound = async () => {
    if (!tournament || !user) return;
    const current = tournament.num_rounds ?? 0;
    if (current >= 20) return;
    const finalRoundMatches = matches.filter((m) => m.round_number === current);
    if (
      finalRoundMatches.length > 0 &&
      finalRoundMatches.every((m) => m.status === "completed" || m.status === "bye")
    )
      return;
    const next = current + 1;
    const { data, error } = await supabase
      .from("tournaments")
      .update({ num_rounds: next })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId ?? "")
      .select(
        "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, join_enabled, join_code, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note",
      )
      .maybeSingle();
    if (!error && data) setTournament(data as TournamentSummary);
  };

  const handleDeleteRound = async (roundNumber: number) => {
    if (!tournament || !user) return;
    if (roundNumber !== tournament.num_rounds) return;
    if (matches.some((m) => m.round_number === roundNumber)) return;
    const newCount = roundNumber - 1;
    if (newCount < 1) return;
    const { data, error } = await supabase
      .from("tournaments")
      .update({ num_rounds: newCount })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId ?? "")
      .select("id, name, status, tournament_type, num_rounds, created_at, created_by")
      .maybeSingle();
    if (!error && data) {
      setTournament(data as TournamentSummary);
      if (typeof selectedRound === "number" && selectedRound > newCount) {
        setSelectedRound(newCount);
      }
    }
  };

  const handleNextRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);
      setSeatWarnings([]);

      await savePendingResults();

      if (typeof selectedRound !== "number") return;
      const nextRoundNumber = selectedRound + 1;
      if (tournament.num_rounds && nextRoundNumber > tournament.num_rounds) {
        throw new Error("Maximum number of rounds reached");
      }

      // Refetch matches so standings use the just-saved results (state may not have updated yet)
      const { data: currentMatchesData, error: fetchErr } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (fetchErr)
        throw new Error(fetchErr.message || "Failed to refresh matches");
      const currentMatchesRaw = (currentMatchesData ?? []) as Match[];

      const playerIdsForNames = new Set<string>();
      currentMatchesRaw.forEach((m) => {
        playerIdsForNames.add(m.player1_id);
        if (m.player2_id) playerIdsForNames.add(m.player2_id);
        if (m.winner_id) playerIdsForNames.add(m.winner_id);
      });
      const { data: namesData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIdsForNames));
      const namesMap = new Map<string, string>();
      namesData?.forEach((p: { id: string; name: string }) =>
        namesMap.set(p.id, p.name),
      );
      const currentMatches: MatchWithPlayers[] = currentMatchesRaw.map((m) => ({
        ...m,
        player1_name: namesMap.get(m.player1_id) ?? "Unknown",
        player2_name: m.player2_id ? (namesMap.get(m.player2_id) ?? "Unknown") : null,
        winner_name: m.winner_id ? (namesMap.get(m.winner_id) ?? "Unknown") : null,
      }));

      // If next round already exists, just navigate to it (do NOT create duplicates)
      const nextRoundAlreadyExists = currentMatches.some(
        (m) => m.round_number === nextRoundNumber,
      );
      if (nextRoundAlreadyExists) {
        setSelectedRound(nextRoundNumber);
        return;
      }

      const currentRoundMatches = currentMatches.filter(
        (m) => m.round_number === selectedRound,
      );
      const incompleteMatches = currentRoundMatches.filter(
        (m) => m.status !== "completed" && m.status !== "bye",
      );
      if (incompleteMatches.length > 0) {
        throw new Error(
          `${incompleteMatches.length} match${incompleteMatches.length > 1 ? "es" : ""} in round ${selectedRound} still need${incompleteMatches.length === 1 ? "s" : ""} a result before advancing`,
        );
      }

      const allPreviousMatches = currentMatches.filter(
        (m) => m.round_number < nextRoundNumber,
      );

      const playerIds = new Set<string>();
      currentMatches.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) playerIds.add(match.player2_id);
      });

      // Fetch all tournament players (including drop status) so we can seed
      // standings correctly and exclude dropped players from the next round.
      const { data: playersData } = await supabase
        .from("tournament_players")
        .select(
          "id, name, dropped, dropped_at_round, has_static_seating, static_seat_number, deck_pokemon1, deck_pokemon2",
        )
        .eq("tournament_id", tournament.id);

      const standings = buildStandingsFromMatches(allPreviousMatches, playersData ?? []);

      // Get previous pairings to avoid rematches (deterministic order: by round, then id)
      const sortedPrevious = [...allPreviousMatches].sort(
        (a, b) =>
          a.round_number - b.round_number ||
          (a.id ?? "").localeCompare(b.id ?? ""),
      );
      const previousPairings: Pairing[] = sortedPrevious.map((match) => ({
        player1Id: match.player1_id,
        player1Name: match.player1_name,
        player2Id: match.player2_id,
        player2Name: match.player2_name,
        roundNumber: match.round_number,
      }));

      // For single-elimination, only undefeated players advance to the next round
      const standingsForPairing =
        tournament.tournament_type === "single_elimination" && nextRoundNumber > 1
          ? standings.filter((s) => s.losses === 0)
          : standings;

      const droppedIds = new Set(
        playersData?.filter((p) => p.dropped).map((p) => p.id) ?? [],
      );
      const standingsToUse = standingsForPairing.filter((s) => !droppedIds.has(s.id));

      if (standingsToUse.length < 2) {
        throw new Error(
          "Not enough active (non-dropped) players remaining to generate pairings",
        );
      }

      const pairingResult = generateSwissPairings(
        standingsToUse,
        nextRoundNumber,
        previousPairings,
      );

      const staticSeats = new Map<string, number>();
      playersData?.forEach((p) => {
        if (p.has_static_seating && p.static_seat_number != null) {
          staticSeats.set(p.id, p.static_seat_number);
        }
      });
      const seatAssignments = assignMatchNumbers(pairingResult.pairings, staticSeats);
      const seatWarningsNext = seatAssignments.map((a) => a.warning).filter(Boolean) as string[];
      setSeatWarnings(seatWarningsNext);

      const seatConflictsNext = seatAssignments.map((a) => a.conflict).filter(Boolean) as SeatConflict[];
      if (seatConflictsNext.length > 0 && pairingResult.decisionLog) {
        pairingResult.decisionLog.seatConflicts = seatConflictsNext;
      }

      const matchesToInsert = pairingResult.pairings.map((pairing, index) => ({
        tournament_id: tournament.id,
        workspace_id: workspaceId,
        round_number: nextRoundNumber,
        match_number: seatAssignments[index].matchNumber,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: MATCH_STATUS.READY,
        result: null,
        winner_id: null,
        pairing_decision_log:
          index === 0 ? serializeDecisionLog(pairingResult.decisionLog) : null,
      }));

      const { error: insertError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert);

      if (insertError) {
        throw new Error(insertError.message || "Failed to create next round");
      }

      // Clear the round timer so the new round starts without a running clock
      await supabase
        .from("tournaments")
        .update({
          current_round_started_at: null,
          round_elapsed_seconds: 0,
          round_is_paused: false,
        })
        .eq("id", tournament.id);
      setTournament((prev) =>
        prev
          ? {
              ...prev,
              current_round_started_at: null,
              round_elapsed_seconds: 0,
              round_is_paused: false,
            }
          : prev,
      );

      await refreshMatches();
      setSelectedRound(nextRoundNumber);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate next round");
    } finally {
      setProcessingRound(false);
    }
  };

  return {
    processingRound,
    seatWarnings,
    setSeatWarnings,
    handleBeginRound,
    handlePauseTimer,
    handleResumeTimer,
    handleSetRoundDuration,
    handleSaveRoundNote,
    handlePublishPairings,
    handleCompleteTournament,
    handleRegenerateRound1,
    handleAddRound,
    handleDeleteRound,
    handleNextRound,
  };
}
