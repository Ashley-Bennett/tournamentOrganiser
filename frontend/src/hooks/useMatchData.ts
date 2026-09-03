import { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import {
  type TournamentPlayer,
  type MatchWithPlayers,
  TOURNAMENT_PLAYER_COLUMNS,
  toMatchWithPlayers,
} from "../types/match";
import type { PairingDecisionLog } from "../utils/tournamentPairing";

interface UseMatchDataParams {
  tournamentId: string | undefined;
  user: User | null;
  setSelectedRound: Dispatch<SetStateAction<number | "standings">>;
  setError: (error: string | null) => void;
}

export function useMatchData({
  tournamentId,
  user,
  setSelectedRound,
  setError,
}: UseMatchDataParams) {
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [roundDecisionLogs, setRoundDecisionLogs] = useState<Map<number, PairingDecisionLog>>(new Map());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const initialRoundSetRef = useRef(false);
  const initialMatchLoadDoneRef = useRef(false);

  // Bump refresh trigger when tab becomes visible (allows token refresh to complete first)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        timer = setTimeout(() => setRefreshTrigger((t) => t + 1), 500);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!tournamentId || !user) return;

    const fetchMatches = async () => {
      const isInitialLoad = !initialMatchLoadDoneRef.current;
      try {
        if (isInitialLoad) setMatchesLoading(true);
        setError(null);

        const { data: matchesData, error: matchesError } = await supabase
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", tournamentId)
          .order("round_number", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (matchesError) {
          throw new Error(matchesError.message || "Failed to load matches");
        }

        // The roster loads whether or not any pairings exist. Manage Players,
        // late entries and drops all need it before round 1 is generated, and
        // this used to sit below the early return — so a tournament with
        // players but no matches showed an empty player list.
        const { data: allPlayersData, error: allPlayersError } = await supabase
          .from("tournament_players")
          .select(TOURNAMENT_PLAYER_COLUMNS)
          .eq("tournament_id", tournamentId)
          .order("name");
        if (allPlayersError) {
          throw new Error(allPlayersError.message || "Failed to load players");
        }
        setPlayers((allPlayersData as TournamentPlayer[]) ?? []);

        if (!matchesData || matchesData.length === 0) {
          setMatches([]);
          if (isInitialLoad) {
            setMatchesLoading(false);
            initialMatchLoadDoneRef.current = true;
          }
          return;
        }

        const playerIds = new Set<string>();
        matchesData.forEach((match) => {
          playerIds.add(match.player1_id);
          if (match.player2_id) playerIds.add(match.player2_id);
          if (match.winner_id) playerIds.add(match.winner_id);
        });

        const { data: playersData, error: playersError } = await supabase
          .from("tournament_players")
          .select("id, name")
          .in("id", Array.from(playerIds));

        if (playersError) {
          throw new Error(playersError.message || "Failed to load players");
        }

        const playersMap = new Map<string, string>();
        playersData?.forEach((p) => playersMap.set(p.id, p.name));

        const matchesWithPlayers: MatchWithPlayers[] = matchesData.map((match) =>
          toMatchWithPlayers(match, (id) => playersMap.get(id) || "Unknown"),
        );

        setMatches(matchesWithPlayers);

        if (!initialRoundSetRef.current && matchesWithPlayers.length > 0) {
          const maxRound = Math.max(...matchesWithPlayers.map((m) => m.round_number));
          setSelectedRound(maxRound);
          initialRoundSetRef.current = true;
        }

        const decisionLogsMap = new Map<number, PairingDecisionLog>();
        const roundsProcessed = new Set<number>();
        for (const match of matchesData) {
          if (match.pairing_decision_log && !roundsProcessed.has(match.round_number)) {
            const log = match.pairing_decision_log as Omit<PairingDecisionLog, "floatReasons"> & {
              floatReasons: Map<string, string> | Record<string, string>;
            };
            const floatReasonsMap =
              log.floatReasons instanceof Map
                ? log.floatReasons
                : new Map(Object.entries(log.floatReasons));
            decisionLogsMap.set(match.round_number, {
              ...log,
              floatReasons: floatReasonsMap,
            } as PairingDecisionLog);
            roundsProcessed.add(match.round_number);
          }
        }
        setRoundDecisionLogs(decisionLogsMap);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load matches");
      } finally {
        if (isInitialLoad) {
          setMatchesLoading(false);
          initialMatchLoadDoneRef.current = true;
        }
      }
    };

    void fetchMatches();
  }, [tournamentId, user, refreshTrigger, setSelectedRound, setError]);

  const refreshMatches = async () => {
    if (!tournamentId) return;

    const { data: matchesData, error: matchesError } = await supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (matchesError) throw new Error(matchesError.message || "Failed to refresh matches");

    const playerIds = new Set<string>();
    matchesData?.forEach((m) => {
      playerIds.add(m.player1_id);
      if (m.player2_id) playerIds.add(m.player2_id);
      if (m.winner_id) playerIds.add(m.winner_id);
    });
    const { data: playersData } = await supabase
      .from("tournament_players")
      .select("id, name")
      .in("id", Array.from(playerIds));
    const playersMap = new Map<string, string>();
    playersData?.forEach((p) => playersMap.set(p.id, p.name));

    const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map((m) =>
      toMatchWithPlayers(m, (id) => playersMap.get(id) || "Unknown"),
    );
    setMatches(matchesWithPlayers);

    const { data: freshPlayers } = await supabase
      .from("tournament_players")
      .select(
        TOURNAMENT_PLAYER_COLUMNS,
      )
      .eq("tournament_id", tournamentId)
      .order("name");
    setPlayers((freshPlayers as TournamentPlayer[]) ?? []);

    const decisionLogsMap = new Map<number, PairingDecisionLog>();
    const roundsProcessed = new Set<number>();
    for (const match of matchesData || []) {
      if (match.pairing_decision_log && !roundsProcessed.has(match.round_number)) {
        const log = match.pairing_decision_log as Omit<PairingDecisionLog, "floatReasons"> & {
          floatReasons: Map<string, string> | Record<string, string>;
        };
        const floatReasonsMap =
          log.floatReasons instanceof Map
            ? log.floatReasons
            : new Map(Object.entries(log.floatReasons));
        decisionLogsMap.set(match.round_number, { ...log, floatReasons: floatReasonsMap } as PairingDecisionLog);
        roundsProcessed.add(match.round_number);
      }
    }
    setRoundDecisionLogs(decisionLogsMap);
  };

  return {
    matches,
    setMatches,
    matchesLoading,
    players,
    setPlayers,
    roundDecisionLogs,
    setRoundDecisionLogs,
    refreshTrigger,
    setRefreshTrigger,
    refreshMatches,
  };
}
