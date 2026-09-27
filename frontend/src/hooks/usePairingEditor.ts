import { useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import type { TournamentSummary } from "../types/tournament";
import { type MatchWithPlayers, MATCH_STATUS,
  decisionLogToJson,
} from "../types/match";

interface UsePairingEditorParams {
  matches: MatchWithPlayers[];
  selectedRound: number | "standings";
  tournament: TournamentSummary | null;
  workspaceId: string | null;
  refreshMatches: () => Promise<void>;
  setError: (error: string | null) => void;
}

export function usePairingEditor({
  matches,
  selectedRound,
  tournament,
  workspaceId,
  refreshMatches,
  setError,
}: UsePairingEditorParams) {
  const [editingPairings, setEditingPairings] = useState(false);
  const [editedPairings, setEditedPairings] = useState<
    Map<string, { player1Id: string | null; player2Id: string | null }>
  >(new Map());
  const [savingPairings, setSavingPairings] = useState(false);

  const roundPlayers = useMemo(() => {
    const seen = new Map<string, string>();
    matches
      .filter(
        (m) =>
          typeof selectedRound === "number" && m.round_number === selectedRound,
      )
      .forEach((m) => {
        seen.set(m.player1_id, m.player1_name);
        if (m.player2_id && m.player2_name)
          seen.set(m.player2_id, m.player2_name);
      });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [matches, selectedRound]);

  const availablePool = useMemo(() => {
    if (!editingPairings) return new Map<string, string>();
    const assigned = new Set<string>();
    for (const { player1Id, player2Id } of editedPairings.values()) {
      if (player1Id) assigned.add(player1Id);
      if (player2Id) assigned.add(player2Id);
    }
    const pool = new Map<string, string>();
    roundPlayers.forEach((p) => {
      if (!assigned.has(p.id)) pool.set(p.id, p.name);
    });
    return pool;
  }, [editingPairings, editedPairings, roundPlayers]);

  const pairingEditsValid = useMemo(() => {
    if (!editingPairings) return true;
    if (availablePool.size > 0) return false;
    return Array.from(editedPairings.values()).every(
      (e) => e.player1Id !== null,
    );
  }, [editingPairings, availablePool, editedPairings]);

  const handleEditPairings = () => {
    const initial = new Map<
      string,
      { player1Id: string | null; player2Id: string | null }
    >();
    matches
      .filter(
        (m) =>
          typeof selectedRound === "number" && m.round_number === selectedRound,
      )
      .forEach((m) => {
        initial.set(m.id, { player1Id: m.player1_id, player2Id: m.player2_id });
      });
    setEditedPairings(initial);
    setEditingPairings(true);
  };

  const handleCancelEditPairings = () => {
    setEditedPairings(new Map());
    setEditingPairings(false);
  };

  const removeFromSlot = (matchId: string, slot: "player1" | "player2") => {
    setEditedPairings((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId);
      if (!cur) return prev;
      next.set(matchId, {
        ...cur,
        [slot === "player1" ? "player1Id" : "player2Id"]: null,
      });
      return next;
    });
  };

  const assignToSlot = (
    matchId: string,
    slot: "player1" | "player2",
    playerId: string,
  ) => {
    setEditedPairings((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId);
      if (!cur) return prev;
      next.set(matchId, {
        ...cur,
        [slot === "player1" ? "player1Id" : "player2Id"]: playerId,
      });
      return next;
    });
  };

  const handleSavePairingEdits = async () => {
    if (!tournament) return;
    if (!workspaceId) {
      setError("Workspace not loaded, so pairings can't be saved");
      return;
    }
    setSavingPairings(true);
    setError(null);
    try {
      const currentRoundMatches = matches.filter(
        (m) =>
          typeof selectedRound === "number" && m.round_number === selectedRound,
      );

      const changedMatches: {
        match: MatchWithPlayers;
        // player1Id is non-null here — a row without one is skipped below.
        edited: { player1Id: string; player2Id: string | null };
      }[] = [];
      for (const match of currentRoundMatches) {
        const edited = editedPairings.get(match.id);
        if (!edited || edited.player1Id === null) continue;
        const p1Changed = edited.player1Id !== match.player1_id;
        const p2Changed = edited.player2Id !== match.player2_id;
        const isLegacyBye = match.status === MATCH_STATUS.BYE;
        if (!p1Changed && !p2Changed && !isLegacyBye) continue;
        changedMatches.push({
          match,
          edited: { ...edited, player1Id: edited.player1Id },
        });
      }

      if (changedMatches.length > 0) {
        // Replaces the changed rows in one transaction and unpublishes the
        // round. It still deletes before inserting, so swapping players between
        // rows cannot trip the per-round unique indexes, but a failure part-way
        // now rolls the delete back instead of losing the pairings.
        const { error: replaceError } = await supabase.rpc(
          "replace_round_matches",
          {
            p_tournament_id: tournament.id,
            p_round_number: selectedRound as number,
            p_match_ids: changedMatches.map(({ match }) => match.id),
            p_matches: changedMatches.map(({ match, edited }) => ({
              match_number: match.match_number,
              player1_id: edited.player1Id,
              player2_id: edited.player2Id,
              pairing_decision_log: decisionLogToJson(match.pairing_decision_log),
            })),
          },
        );
        if (replaceError)
          throw new Error(replaceError.message || "Failed to update pairings");
      } else {
        await supabase
          .from("tournament_matches")
          .update({ pairings_published: false })
          .eq("tournament_id", tournament.id)
          .eq("round_number", selectedRound as number)
          .eq("status", MATCH_STATUS.READY);
      }

      await refreshMatches();
      setEditingPairings(false);
      setEditedPairings(new Map());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save pairing edits");
    } finally {
      setSavingPairings(false);
    }
  };

  return {
    editingPairings,
    editedPairings,
    savingPairings,
    roundPlayers,
    availablePool,
    pairingEditsValid,
    handleEditPairings,
    handleCancelEditPairings,
    handleSavePairingEdits,
    removeFromSlot,
    assignToSlot,
  };
}
