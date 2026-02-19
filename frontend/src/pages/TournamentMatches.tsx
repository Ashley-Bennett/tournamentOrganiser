import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  InputAdornment,
  OutlinedInput,
  InputLabel,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import PageLoading from "../components/PageLoading";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import {
  generateSwissPairings,
  calculateMatchPoints,
  type Pairing,
  type PlayerStanding,
  type PairingDecisionLog,
} from "../utils/tournamentPairing";
import { sortByTieBreakers } from "../utils/tieBreaking";

interface TournamentSummary {
  id: string;
  name: string;
  status: string;
  tournament_type: string;
  num_rounds: number | null;
  created_at: string;
  created_by: string;
}

interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  status: "ready" | "pending" | "completed" | "bye";
  pairing_decision_log?: PairingDecisionLog | null;
  created_at: string;
}

interface MatchWithPlayers extends Match {
  player1_name: string;
  player2_name: string | null;
  winner_name: string | null;
}

// Helper functions to persist pending results to localStorage
const getPendingResultsKey = (tournamentId: string) =>
  `tournament_pending_results_${tournamentId}`;

const loadPendingResults = (
  tournamentId: string,
): Map<string, { winnerId: string | null; result: string }> => {
  try {
    const key = getPendingResultsKey(tournamentId);
    const stored = localStorage.getItem(key);
    if (!stored) return new Map();
    const data = JSON.parse(stored) as Record<
      string,
      { winnerId: string | null; result: string }
    >;
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
};

const savePendingResultsToStorage = (
  tournamentId: string,
  pendingResults: Map<string, { winnerId: string | null; result: string }>,
) => {
  try {
    const key = getPendingResultsKey(tournamentId);
    if (pendingResults.size === 0) {
      localStorage.removeItem(key);
    } else {
      const data = Object.fromEntries(pendingResults);
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (error) {
    console.error("Failed to save pending results to localStorage:", error);
  }
};

const clearPendingResultsFromStorage = (tournamentId: string) => {
  try {
    const key = getPendingResultsKey(tournamentId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear pending results from localStorage:", error);
  }
};

// Helper to convert PairingDecisionLog for database storage (Map -> object)
const serializeDecisionLog = (
  log: PairingDecisionLog | undefined,
): Record<string, unknown> | null => {
  if (!log) return null;
  return {
    ...log,
    floatReasons: Object.fromEntries(log.floatReasons),
  };
};

const TournamentMatches: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);
  const [sortBy, setSortBy] = useState<"match" | "status">("match");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [processingRound, setProcessingRound] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithPlayers | null>(
    null,
  );
  const [selectedWinner, setSelectedWinner] = useState<string>("");
  const [player1Wins, setPlayer1Wins] = useState<number>(0);
  const [player2Wins, setPlayer2Wins] = useState<number>(0);
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [pendingResults, setPendingResults] = useState<
    Map<string, { winnerId: string | null; result: string }>
  >(new Map());
  const [roundDecisionLogs, setRoundDecisionLogs] = useState<
    Map<number, PairingDecisionLog>
  >(new Map());

  const standingsByPlayerId = useMemo(() => {
    // Standings as-of the start of the selected round (all rounds < selectedRound)
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        wins: number;
        losses: number;
        draws: number;
        matchPoints: number;
      }
    >();

    // Seed from known players in matches (names already resolved)
    for (const m of matches) {
      if (!map.has(m.player1_id)) {
        map.set(m.player1_id, {
          id: m.player1_id,
          name: m.player1_name,
          wins: 0,
          losses: 0,
          draws: 0,
          matchPoints: 0,
        });
      }
      if (m.player2_id && !map.has(m.player2_id)) {
        map.set(m.player2_id, {
          id: m.player2_id,
          name: m.player2_name || "Unknown",
          wins: 0,
          losses: 0,
          draws: 0,
          matchPoints: 0,
        });
      }
    }

    const priorMatches = matches.filter(
      (m) =>
        typeof selectedRound === "number" && m.round_number < selectedRound,
    );

    for (const m of priorMatches) {
      const p1 = map.get(m.player1_id);
      const p2 = m.player2_id ? map.get(m.player2_id) : null;
      if (!p1) continue;

      const isBye = m.status === "bye" || m.player2_id === null;
      const isDraw =
        m.status === "completed" && m.winner_id === null && m.result === "Draw";
      const isCompletedWin =
        m.status === "completed" && m.winner_id !== null && m.result !== "Draw";

      if (isBye) {
        p1.wins += 1;
      } else if (isDraw) {
        p1.draws += 1;
        if (p2) p2.draws += 1;
      } else if (isCompletedWin) {
        if (m.winner_id === m.player1_id) {
          p1.wins += 1;
          if (p2) p2.losses += 1;
        } else if (m.player2_id && m.winner_id === m.player2_id) {
          p1.losses += 1;
          if (p2) p2.wins += 1;
        }
      }

      // Recompute points for players we touched
      p1.matchPoints = calculateMatchPoints(p1.wins, p1.draws);
      if (p2) p2.matchPoints = calculateMatchPoints(p2.wins, p2.draws);
    }

    return map;
  }, [matches, selectedRound]);

  useEffect(() => {
    if (!id) {
      setError("Missing tournament id");
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    const fetchTournament = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, tournament_type, num_rounds, created_at, created_by",
          )
          .eq("id", id)
          .eq("created_by", user.id)
          .maybeSingle();

        if (error) {
          throw new Error(error.message || "Failed to load tournament");
        }
        if (!data) {
          setError("Tournament not found");
          setTournament(null);
        } else {
          setTournament(data as TournamentSummary);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load tournament");
        setTournament(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchTournament();
  }, [id, user, authLoading, navigate]);

  // Load pending results from localStorage when tournament changes
  useEffect(() => {
    if (!tournament?.id) return;
    const loaded = loadPendingResults(tournament.id);
    setPendingResults(loaded);
  }, [tournament?.id]);

  // Clean up pending results for matches that no longer exist
  useEffect(() => {
    if (matches.length === 0 || pendingResults.size === 0) return;
    const matchIds = new Set(matches.map((m) => m.id));
    const hasInvalidEntries = Array.from(pendingResults.keys()).some(
      (matchId) => !matchIds.has(matchId),
    );
    if (hasInvalidEntries) {
      setPendingResults((prev) => {
        const next = new Map();
        for (const [matchId, result] of prev.entries()) {
          if (matchIds.has(matchId)) {
            next.set(matchId, result);
          }
        }
        return next;
      });
    }
  }, [matches, pendingResults]);

  // Save pending results to localStorage whenever they change
  useEffect(() => {
    if (!tournament?.id) return;
    savePendingResultsToStorage(tournament.id, pendingResults);
  }, [tournament?.id, pendingResults]);

  useEffect(() => {
    if (!tournament?.id || !user) return;

    const fetchMatches = async () => {
      try {
        setMatchesLoading(true);
        setError(null);

        // Fetch matches - stable order so match numbers never change
        const { data: matchesData, error: matchesError } = await supabase
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", tournament.id)
          .order("round_number", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (matchesError) {
          throw new Error(matchesError.message || "Failed to load matches");
        }

        if (!matchesData || matchesData.length === 0) {
          setMatches([]);
          setMatchesLoading(false);
          return;
        }

        // Fetch player names
        const playerIds = new Set<string>();
        matchesData.forEach((match) => {
          playerIds.add(match.player1_id);
          if (match.player2_id) {
            playerIds.add(match.player2_id);
          }
          if (match.winner_id) {
            playerIds.add(match.winner_id);
          }
        });

        const { data: playersData, error: playersError } = await supabase
          .from("tournament_players")
          .select("id, name")
          .in("id", Array.from(playerIds));

        if (playersError) {
          throw new Error(playersError.message || "Failed to load players");
        }

        const playersMap = new Map<string, string>();
        playersData?.forEach((player) => {
          playersMap.set(player.id, player.name);
        });

        // Combine matches with player names
        const matchesWithPlayers: MatchWithPlayers[] = matchesData.map(
          (match) => ({
            ...match,
            player1_name: playersMap.get(match.player1_id) || "Unknown",
            player2_name: match.player2_id
              ? playersMap.get(match.player2_id) || "Unknown"
              : null,
            winner_name: match.winner_id
              ? playersMap.get(match.winner_id) || "Unknown"
              : null,
          }),
        );

        setMatches(matchesWithPlayers);

        // Extract decision logs from matches (stored on first match of each round)
        const decisionLogsMap = new Map<number, PairingDecisionLog>();
        const roundsProcessed = new Set<number>();

        for (const match of matchesData) {
          if (
            match.pairing_decision_log &&
            !roundsProcessed.has(match.round_number)
          ) {
            const log = match.pairing_decision_log as Omit<
              PairingDecisionLog,
              "floatReasons"
            > & {
              floatReasons: Map<string, string> | Record<string, string>;
            };
            // Convert floatReasons object back to Map if needed
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
        setMatchesLoading(false);
      }
    };

    void fetchMatches();
  }, [tournament?.id, user]);

  // Calculate final standings for leaderboard
  const finalStandings = useMemo(() => {
    if (!matches.length) return [];

    // Initialize standings map
    const standingsMap = new Map<string, PlayerStanding>();
    matches.forEach((match) => {
      if (!standingsMap.has(match.player1_id)) {
        standingsMap.set(match.player1_id, {
          id: match.player1_id,
          name: match.player1_name,
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      }
      if (match.player2_id && !standingsMap.has(match.player2_id)) {
        standingsMap.set(match.player2_id, {
          id: match.player2_id,
          name: match.player2_name || "Unknown",
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      }
    });

    // Process all matches to calculate standings
    matches.forEach((match) => {
      const player1 = standingsMap.get(match.player1_id);
      const player2 = match.player2_id
        ? standingsMap.get(match.player2_id)
        : null;

      const isBye = match.status === "bye" || !match.player2_id;
      const isDraw =
        match.status === "completed" &&
        match.winner_id === null &&
        match.result === "Draw";
      const isCompletedWin =
        match.status === "completed" &&
        match.winner_id !== null &&
        match.result !== "Draw";

      // Only process completed matches or byes
      if (!isBye && !isDraw && !isCompletedWin) {
        return; // Skip incomplete matches
      }

      if (player1) {
        player1.matchesPlayed++;
        if (isBye) {
          player1.byesReceived++;
          player1.wins++;
          player1.matchPoints = calculateMatchPoints(
            player1.wins,
            player1.draws,
          );
        } else if (isDraw) {
          player1.draws++;
          player1.matchPoints = calculateMatchPoints(
            player1.wins,
            player1.draws,
          );
          if (match.player2_id) {
            player1.opponents.push(match.player2_id);
          }
        } else if (isCompletedWin) {
          if (match.winner_id === match.player1_id) {
            player1.wins++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
          } else {
            player1.losses++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
          }
          if (match.player2_id) {
            player1.opponents.push(match.player2_id);
          }
        }
      }

      if (player2) {
        player2.matchesPlayed++;
        if (isDraw) {
          player2.draws++;
          player2.matchPoints = calculateMatchPoints(
            player2.wins,
            player2.draws,
          );
          player2.opponents.push(match.player1_id);
        } else if (isCompletedWin) {
          if (match.winner_id === match.player2_id) {
            player2.wins++;
            player2.matchPoints = calculateMatchPoints(
              player2.wins,
              player2.draws,
            );
          } else {
            player2.losses++;
            player2.matchPoints = calculateMatchPoints(
              player2.wins,
              player2.draws,
            );
          }
          player2.opponents.push(match.player1_id);
        }
      }
    });

    standingsMap.forEach((standing) => {
      standing.matchPoints = calculateMatchPoints(
        standing.wins,
        standing.draws,
      );
    });

    const standings = Array.from(standingsMap.values());
    return sortByTieBreakers(standings);
  }, [matches]);

  // Reserved for future use: open score dialog with pre-selected match/winner
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- handler kept for wiring to UI
  const handleOpenScoreDialog = (
    match: MatchWithPlayers,
    winnerId: string | null = null,
  ) => {
    setSelectedMatch(match);
    // Pre-select winner if provided, otherwise check existing winner
    if (winnerId) {
      if (winnerId === match.player1_id) {
        setSelectedWinner("player1");
      } else if (winnerId === match.player2_id) {
        setSelectedWinner("player2");
      } else {
        setSelectedWinner("");
      }
    } else if (match.winner_id) {
      if (match.winner_id === match.player1_id) {
        setSelectedWinner("player1");
      } else if (match.winner_id === match.player2_id) {
        setSelectedWinner("player2");
      } else {
        setSelectedWinner("");
      }
    } else {
      setSelectedWinner("");
    }

    // Parse existing score if available (format: "2-0", "2-1", etc.)
    if (match.result && match.result !== "bye" && match.result !== "Draw") {
      const parts = match.result.split("-");
      if (parts.length === 2) {
        setPlayer1Wins(parseInt(parts[0], 10) || 0);
        setPlayer2Wins(parseInt(parts[1], 10) || 0);
      } else {
        setPlayer1Wins(0);
        setPlayer2Wins(0);
      }
    } else {
      setPlayer1Wins(0);
      setPlayer2Wins(0);
    }

    setScoreDialogOpen(true);
  };

  const handleCloseScoreDialog = () => {
    setScoreDialogOpen(false);
    setSelectedMatch(null);
    setSelectedWinner("");
    setPlayer1Wins(0);
    setPlayer2Wins(0);
  };

  const getScoreValidationError = (): string | null => {
    if (!selectedMatch || !selectedWinner) return null;

    // Validate score for non-draw matches
    if (selectedWinner !== "draw" && selectedMatch.player2_id) {
      if (player1Wins === 0 && player2Wins === 0) {
        return "Please enter a valid score";
      }
      // Ensure winner has more wins
      if (
        (selectedWinner === "player1" && player1Wins <= player2Wins) ||
        (selectedWinner === "player2" && player2Wins <= player1Wins)
      ) {
        return "Winner must have more wins than opponent";
      }
    }

    return null;
  };

  const handleQuickResult = (
    match: MatchWithPlayers,
    result: "player1" | "player2" | "draw",
  ) => {
    if (!match.player2_id) return; // Can't set result for bye

    let winnerId: string | null = null;
    let resultString = "";

    if (result === "draw") {
      winnerId = null;
      resultString = "Draw";
    } else if (result === "player1") {
      winnerId = match.player1_id;
      resultString = "1-0"; // Best of 1
    } else {
      // result === "player2"
      winnerId = match.player2_id;
      resultString = "0-1"; // Best of 1
    }

    // Store in pending results (not saved to DB yet)
    setPendingResults((prev) => {
      const next = new Map(prev);
      next.set(match.id, { winnerId, result: resultString });
      return next;
    });
  };

  const savePendingResults = async (): Promise<void> => {
    if (pendingResults.size === 0) return;

    try {
      setUpdatingMatch(true);
      setError(null);

      // Save all pending results
      const updates = Array.from(pendingResults.entries()).map(
        ([matchId, { winnerId, result }]) => ({
          id: matchId,
          winner_id: winnerId,
          result,
          status: "completed" as const,
        }),
      );

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from("tournament_matches")
          .update({
            winner_id: update.winner_id,
            result: update.result,
            status: update.status,
          })
          .eq("id", update.id);

        if (updateError) {
          throw new Error(updateError.message || "Failed to update match");
        }
      }

      // Clear pending results
      setPendingResults(new Map());
      if (tournament?.id) {
        clearPendingResultsFromStorage(tournament.id);
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament!.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const playerIds = new Set<string>();
      matchesData?.forEach((m) => {
        playerIds.add(m.player1_id);
        if (m.player2_id) {
          playerIds.add(m.player2_id);
        }
        if (m.winner_id) {
          playerIds.add(m.winner_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (m) => ({
          ...m,
          player1_name: playersMap.get(m.player1_id) || "Unknown",
          player2_name: m.player2_id
            ? playersMap.get(m.player2_id) || "Unknown"
            : null,
          winner_name: m.winner_id
            ? playersMap.get(m.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save results");
      throw e; // Re-throw so handleNextRound can handle it
    } finally {
      setUpdatingMatch(false);
    }
  };

  const handleSaveMatchResult = async () => {
    if (!selectedMatch || !selectedWinner) return;

    const validationError = getScoreValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setUpdatingMatch(true);
      setError(null);

      // Determine winner_id based on selection
      let winnerId: string | null = null;
      if (selectedWinner === "player1") {
        winnerId = selectedMatch.player1_id;
      } else if (selectedWinner === "player2" && selectedMatch.player2_id) {
        winnerId = selectedMatch.player2_id;
      } else if (selectedWinner === "draw") {
        // For draws, winner_id stays null
        winnerId = null;
      }

      // Generate score string
      let resultString = "";
      if (selectedWinner === "draw") {
        resultString = "Draw";
      } else if (selectedMatch.player2_id) {
        resultString = `${player1Wins}-${player2Wins}`;
      } else {
        resultString = "Bye";
      }

      // Update match in database
      const updateData: {
        winner_id?: string | null;
        result: string;
        status: "completed" | "pending";
      } = {
        result: resultString,
        status: selectedWinner === "draw" || winnerId ? "completed" : "pending",
      };

      if (winnerId !== undefined) {
        updateData.winner_id = winnerId;
      }

      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update(updateData)
        .eq("id", selectedMatch.id);

      if (updateError) {
        throw new Error(updateError.message || "Failed to update match");
      }

      // Refresh matches - same stable order so match numbers stay fixed
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament!.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const playerIds = new Set<string>();
      matchesData?.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          playerIds.add(match.winner_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: playersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? playersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? playersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
      handleCloseScoreDialog();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update match");
    } finally {
      setUpdatingMatch(false);
    }
  };

  const handleBeginRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      // Update all "ready" matches in current round to "pending"
      if (typeof selectedRound !== "number") return;
      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update({ status: "pending" })
        .eq("tournament_id", tournament.id)
        .eq("round_number", selectedRound)
        .eq("status", "ready");

      if (updateError) {
        throw new Error(updateError.message || "Failed to begin round");
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const playerIds = new Set<string>();
      matchesData?.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          playerIds.add(match.winner_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: playersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? playersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? playersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to begin round");
    } finally {
      setProcessingRound(false);
    }
  };

  const handleCompleteTournament = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      // Save all pending results first
      await savePendingResults();

      // Update tournament status to completed
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ status: "completed" })
        .eq("id", tournament.id)
        .eq("created_by", user.id);

      if (updateError) {
        throw new Error(updateError.message || "Failed to complete tournament");
      }

      // Switch to standings tab
      setSelectedRound("standings");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to complete tournament",
      );
    } finally {
      setProcessingRound(false);
    }
  };

  const handleRegenerateRound1 = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      // Fetch all players for the tournament
      const { data: playersData, error: playersError } = await supabase
        .from("tournament_players")
        .select("id, name")
        .eq("tournament_id", tournament.id)
        .order("created_at", { ascending: true });

      if (playersError) {
        throw new Error(playersError.message || "Failed to load players");
      }

      if (!playersData || playersData.length < 2) {
        throw new Error("Tournament needs at least 2 players");
      }

      // Generate round 1 pairings
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

      // Delete any existing round 1 matches
      const { error: deleteError } = await supabase
        .from("tournament_matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("round_number", 1);

      if (deleteError) {
        throw new Error(
          deleteError.message || "Failed to delete existing round 1 matches",
        );
      }

      // Create new round 1 matches
      const matchesToInsert = pairingResult.pairings.map((pairing, index) => ({
        tournament_id: tournament.id,
        round_number: 1,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: pairing.player2Id === null ? "bye" : "ready",
        result: pairing.player2Id === null ? "bye" : null,
        winner_id: pairing.player2Id === null ? pairing.player1Id : null,
        pairing_decision_log:
          index === 0 ? serializeDecisionLog(pairingResult.decisionLog) : null,
      }));

      const { error: insertError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert);

      if (insertError) {
        throw new Error(
          insertError.message || "Failed to create round 1 matches",
        );
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch player names
      const playerIds = new Set<string>();
      matchesData?.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          playerIds.add(match.winner_id);
        }
      });

      const { data: updatedPlayersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      updatedPlayersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: playersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? playersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? playersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);

      // Extract decision logs from refreshed matches (including the regenerated round 1)
      const decisionLogsMap = new Map<number, PairingDecisionLog>();
      const roundsProcessed = new Set<number>();

      for (const match of matchesData || []) {
        if (
          match.pairing_decision_log &&
          !roundsProcessed.has(match.round_number)
        ) {
          const log = match.pairing_decision_log as Omit<
            PairingDecisionLog,
            "floatReasons"
          > & {
            floatReasons: Map<string, string> | Record<string, string>;
          };
          // Convert floatReasons object back to Map if needed
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
      setSelectedRound(1);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to regenerate round 1 pairings",
      );
    } finally {
      setProcessingRound(false);
    }
  };

  const handleNextRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      // Save all pending results before generating next round
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
        player2_name: m.player2_id
          ? namesMap.get(m.player2_id) ?? "Unknown"
          : null,
        winner_name: m.winner_id
          ? namesMap.get(m.winner_id) ?? "Unknown"
          : null,
      }));

      // If next round already exists, just navigate to it (do NOT create duplicates)
      const nextRoundAlreadyExists = currentMatches.some(
        (m) => m.round_number === nextRoundNumber,
      );
      if (nextRoundAlreadyExists) {
        setSelectedRound(nextRoundNumber);
        return;
      }

      // Calculate standings from all previous rounds (using refetched matches)
      const allPreviousMatches = currentMatches.filter(
        (m) => m.round_number < nextRoundNumber,
      );

      // Get all players
      const playerIds = new Set<string>();
      currentMatches.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      // Calculate standings
      const standingsMap = new Map<string, PlayerStanding>();
      playersData?.forEach((player) => {
        standingsMap.set(player.id, {
          id: player.id,
          name: player.name,
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      });

      // Process matches to calculate standings
      // Only count completed matches (or byes) to match display logic
      allPreviousMatches.forEach((match) => {
        const player1 = standingsMap.get(match.player1_id);
        const player2 = match.player2_id
          ? standingsMap.get(match.player2_id)
          : null;

        const isBye = match.status === "bye" || !match.player2_id;
        const isDraw =
          match.status === "completed" &&
          match.winner_id === null &&
          match.result === "Draw";
        const isCompletedWin =
          match.status === "completed" &&
          match.winner_id !== null &&
          match.result !== "Draw";

        // Only process completed matches or byes
        if (!isBye && !isDraw && !isCompletedWin) {
          return; // Skip incomplete matches
        }

        if (player1) {
          player1.matchesPlayed++;
          if (isBye) {
            player1.byesReceived++;
            player1.wins++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
          } else if (isDraw) {
            player1.draws++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
            if (match.player2_id) {
              player1.opponents.push(match.player2_id);
            }
          } else if (isCompletedWin) {
            if (match.winner_id === match.player1_id) {
              player1.wins++;
              player1.matchPoints = calculateMatchPoints(
                player1.wins,
                player1.draws,
              );
            } else {
              player1.losses++;
              player1.matchPoints = calculateMatchPoints(
                player1.wins,
                player1.draws,
              );
            }
            if (match.player2_id) {
              player1.opponents.push(match.player2_id);
            }
          }
        }

        if (player2) {
          player2.matchesPlayed++;
          if (isDraw) {
            player2.draws++;
            player2.matchPoints = calculateMatchPoints(
              player2.wins,
              player2.draws,
            );
            player2.opponents.push(match.player1_id);
          } else if (isCompletedWin) {
            if (match.winner_id === match.player2_id) {
              player2.wins++;
              player2.matchPoints = calculateMatchPoints(
                player2.wins,
                player2.draws,
              );
            } else {
              player2.losses++;
              player2.matchPoints = calculateMatchPoints(
                player2.wins,
                player2.draws,
              );
            }
            player2.opponents.push(match.player1_id);
          }
        }
      });

      // Recompute matchPoints for every player so standings are correct for pairing
      standingsMap.forEach((standing) => {
        standing.matchPoints = calculateMatchPoints(
          standing.wins,
          standing.draws,
        );
      });

      const standings = Array.from(standingsMap.values());

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

      // Generate pairings for next round
      const pairingResult = generateSwissPairings(
        standings,
        nextRoundNumber,
        previousPairings,
      );

      // Create matches in database
      // Pairings are already sorted with byes at the end by generateSwissPairings
      // Store decision log on the first match of the round
      const matchesToInsert = pairingResult.pairings.map((pairing, index) => ({
        tournament_id: tournament.id,
        round_number: nextRoundNumber,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: pairing.player2Id === null ? "bye" : "ready",
        result: pairing.player2Id === null ? "bye" : null,
        winner_id: pairing.player2Id === null ? pairing.player1Id : null,
        pairing_decision_log:
          index === 0 ? serializeDecisionLog(pairingResult.decisionLog) : null,
      }));

      const { error: insertError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert);

      if (insertError) {
        throw new Error(insertError.message || "Failed to create next round");
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const allPlayerIds = new Set<string>();
      matchesData?.forEach((match) => {
        allPlayerIds.add(match.player1_id);
        if (match.player2_id) {
          allPlayerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          allPlayerIds.add(match.winner_id);
        }
      });

      const { data: allPlayersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(allPlayerIds));

      const allPlayersMap = new Map<string, string>();
      allPlayersData?.forEach((player) => {
        allPlayersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: allPlayersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? allPlayersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? allPlayersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);

      // Extract decision logs from refreshed matches (including the newly created round)
      const decisionLogsMap = new Map<number, PairingDecisionLog>();
      const roundsProcessed = new Set<number>();

      for (const match of matchesData || []) {
        if (
          match.pairing_decision_log &&
          !roundsProcessed.has(match.round_number)
        ) {
          const log = match.pairing_decision_log as Omit<
            PairingDecisionLog,
            "floatReasons"
          > & {
            floatReasons: Map<string, string> | Record<string, string>;
          };
          // Convert floatReasons object back to Map if needed
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
      setSelectedRound(nextRoundNumber);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to generate next round",
      );
    } finally {
      setProcessingRound(false);
    }
  };

  if (authLoading || loading || matchesLoading) {
    return <PageLoading />;
  }

  if (error || !tournament) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(`/tournaments/${id}`)}
            sx={{ mr: 2 }}
          >
            Back to tournament
          </Button>
          <Typography variant="h4" component="h1">
            Matches
          </Typography>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/tournaments/${tournament.id}`)}
          sx={{ mr: 2 }}
        >
          Back to tournament
        </Button>
        <Typography variant="h4" component="h1">
          {tournament.name} - Matches
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {matches.length === 0 && !tournament.num_rounds ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            No Matches Yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Matches will appear here once the tournament has been started and
            round 1 pairings have been generated.
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          {((): ReactNode => {
            const totalRounds = tournament.num_rounds ?? 1;
            const roundNumbers = Array.from(
              { length: totalRounds },
              (_, i) => i + 1,
            );

            const hasMatchesForStandings = matches.length > 0;
            const tabValue =
              selectedRound === "standings"
                ? "standings"
                : Math.min(
                    typeof selectedRound === "number" ? selectedRound : 1,
                    totalRounds,
                  );

            return (
              <>
                <Tabs
                  value={tabValue}
                  onChange={(_, value: number | string) => {
                    setSelectedRound(
                      value === "standings" ? "standings" : (value as number),
                    );
                    // Note: We keep pending results when switching rounds
                    // They persist across navigation and are cleared when saved
                  }}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{
                    borderBottom: 1,
                    borderColor: "divider",
                    "& .MuiTab-root": { minHeight: 48 },
                    "& .Mui-disabled": { opacity: 0.5 },
                  }}
                >
                  {roundNumbers.map((roundNumber) => {
                    const roundMatches = matches.filter(
                      (m) => m.round_number === roundNumber,
                    );
                    const hasMatches = roundMatches.length > 0;
                    return (
                      <Tab
                        key={roundNumber}
                        label={`Round ${roundNumber}`}
                        value={roundNumber}
                        disabled={!hasMatches}
                        sx={
                          hasMatches
                            ? {}
                            : {
                                color: "text.secondary",
                                fontWeight: 500,
                              }
                        }
                      />
                    );
                  })}
                  <Tab
                    label="Final Standings"
                    value="standings"
                    disabled={!hasMatchesForStandings}
                    sx={
                      hasMatchesForStandings
                        ? {}
                        : {
                            color: "text.secondary",
                            fontWeight: 500,
                          }
                    }
                  />
                </Tabs>
                <Box sx={{ p: 3 }}>
                  {((): ReactNode => {
                    // Standings tab
                    if (selectedRound === "standings") {
                      const getRankDisplay = (rank: number): string => {
                        if (rank === 1) return "🥇";
                        if (rank === 2) return "🥈";
                        if (rank === 3) return "🥉";
                        return `${rank}`;
                      };

                      return (
                        <Box>
                          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                            Final Standings
                          </Typography>
                          {finalStandings.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No standings available yet. Complete some matches
                              to see standings.
                            </Typography>
                          ) : (
                            <TableContainer>
                              <Table>
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: "bold" }}>
                                      Rank
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: "bold" }}>
                                      Player
                                    </TableCell>
                                    <TableCell
                                      sx={{ fontWeight: "bold" }}
                                      align="right"
                                    >
                                      Record
                                    </TableCell>
                                    <TableCell
                                      sx={{ fontWeight: "bold" }}
                                      align="right"
                                    >
                                      Match Points
                                    </TableCell>
                                    <TableCell
                                      sx={{ fontWeight: "bold" }}
                                      align="right"
                                    >
                                      OMW%
                                    </TableCell>
                                    <TableCell
                                      sx={{ fontWeight: "bold" }}
                                      align="right"
                                    >
                                      OOMW%
                                    </TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {finalStandings.map((player, index) => {
                                    const rank = index + 1;
                                    const isTopThree = rank <= 3;
                                    return (
                                      <TableRow
                                        key={player.id}
                                        sx={{
                                          backgroundColor: isTopThree
                                            ? rank === 1
                                              ? "rgba(255, 215, 0, 0.1)"
                                              : rank === 2
                                              ? "rgba(192, 192, 192, 0.1)"
                                              : "rgba(205, 127, 50, 0.1)"
                                            : "transparent",
                                          "&:hover": {
                                            backgroundColor: isTopThree
                                              ? rank === 1
                                                ? "rgba(255, 215, 0, 0.15)"
                                                : rank === 2
                                                ? "rgba(192, 192, 192, 0.15)"
                                                : "rgba(205, 127, 50, 0.15)"
                                              : "rgba(0, 0, 0, 0.04)",
                                          },
                                        }}
                                      >
                                        <TableCell>
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            gap={1}
                                          >
                                            {isTopThree && (
                                              <EmojiEventsIcon
                                                sx={{
                                                  color:
                                                    rank === 1
                                                      ? "gold"
                                                      : rank === 2
                                                      ? "silver"
                                                      : "#CD7F32",
                                                }}
                                              />
                                            )}
                                            <Typography
                                              variant="body1"
                                              sx={{
                                                fontWeight: isTopThree
                                                  ? "bold"
                                                  : "normal",
                                              }}
                                            >
                                              {getRankDisplay(rank)}
                                            </Typography>
                                          </Box>
                                        </TableCell>
                                        <TableCell>
                                          <Typography
                                            variant="body1"
                                            sx={{
                                              fontWeight: isTopThree
                                                ? "bold"
                                                : "normal",
                                            }}
                                          >
                                            {player.name}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">
                                            {player.wins}-{player.losses}-
                                            {player.draws}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography
                                            variant="body1"
                                            sx={{
                                              fontWeight: isTopThree
                                                ? "bold"
                                                : "normal",
                                            }}
                                          >
                                            {player.matchPoints}
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">
                                            {(
                                              player.opponentMatchWinPercentage *
                                              100
                                            ).toFixed(1)}
                                            %
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                          <Typography variant="body2">
                                            {(
                                              player.opponentOpponentMatchWinPercentage *
                                              100
                                            ).toFixed(1)}
                                            %
                                          </Typography>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </Box>
                      );
                    }

                    // Display decision log if available for this round
                    const decisionLog =
                      typeof selectedRound === "number"
                        ? roundDecisionLogs.get(selectedRound)
                        : undefined;

                    // Preserve DB order (created_at then id) so match numbers follow pairing order:
                    // highest tables first, and byes at the end.
                    // Note: matches are already fetched ordered by round_number, created_at, id.
                    const baseMatches =
                      typeof selectedRound === "number"
                        ? matches.filter(
                            (m) => m.round_number === selectedRound,
                          )
                        : [];

                    // Check round state for button display
                    const roundMatchesForState =
                      typeof selectedRound === "number"
                        ? matches.filter(
                            (m) => m.round_number === selectedRound,
                          )
                        : [];
                    const hasReadyMatches = roundMatchesForState.some(
                      (m) => m.status === "ready",
                    );
                    const hasPendingMatches = roundMatchesForState.some(
                      (m) => m.status === "pending",
                    );
                    // A match is "complete" if it's either saved as completed/bye OR has a pending result
                    const allCompleted =
                      roundMatchesForState.length > 0 &&
                      roundMatchesForState.every((m) => {
                        // Bye matches are always complete
                        if (m.status === "bye" || !m.player2_id) return true;
                        // Check if match is completed in database
                        if (m.status === "completed") return true;
                        // Check if match has a pending result set
                        return pendingResults.has(m.id);
                      });
                    const canShowNextRound =
                      tournament.num_rounds &&
                      typeof selectedRound === "number" &&
                      selectedRound < tournament.num_rounds;
                    const canProceedToNextRound =
                      allCompleted && canShowNextRound;
                    const showBeginRound =
                      hasReadyMatches && !hasPendingMatches;
                    const nextRoundNumber =
                      typeof selectedRound === "number" ? selectedRound + 1 : 0;
                    const nextRoundAlreadyExists = matches.some(
                      (m) => m.round_number === nextRoundNumber,
                    );
                    const isFinalRound =
                      tournament.num_rounds &&
                      selectedRound === tournament.num_rounds;
                    const canCompleteTournament = isFinalRound && allCompleted;

                    // Map match id -> absolute match number (1-based, by DB order within round)
                    const matchNumberById = new Map<string, number>();
                    baseMatches.forEach((m, i) =>
                      matchNumberById.set(m.id, i + 1),
                    );

                    // Apply sort by Match # or Status
                    const roundMatches = [...baseMatches];
                    const getMatchNum = (m: (typeof baseMatches)[0]) =>
                      matchNumberById.get(m.id) ?? 0;

                    if (sortBy === "match") {
                      roundMatches.sort((a, b) => {
                        const numA = getMatchNum(a);
                        const numB = getMatchNum(b);
                        const cmp = numA - numB;
                        return sortOrder === "asc" ? cmp : -cmp;
                      });
                    } else {
                      // sortBy === "status": by status, byes last, then secondary by match number
                      roundMatches.sort((a, b) => {
                        const aIsBye =
                          a.status === "bye" || a.player2_id === null;
                        const bIsBye =
                          b.status === "bye" || b.player2_id === null;
                        if (aIsBye && !bIsBye) return 1; // bye comes after
                        if (!aIsBye && bIsBye) return -1; // non-bye comes before

                        const statusOrder: Record<string, number> = {
                          ready: 0,
                          pending: 1,
                          completed: 2,
                          bye: 3,
                        };
                        const aVal = statusOrder[a.status] ?? 0;
                        const bVal = statusOrder[b.status] ?? 0;
                        const cmp = aVal - bVal;
                        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
                        // Same status: stable sort by match number
                        return getMatchNum(a) - getMatchNum(b);
                      });
                    }

                    const hasMatches = roundMatches.length > 0;

                    const handleSort = (column: "match" | "status") => {
                      setSortBy(column);
                      setSortOrder((prev) =>
                        sortBy === column
                          ? prev === "asc"
                            ? "desc"
                            : "asc"
                          : "asc",
                      );
                    };

                    return hasMatches ? (
                      <Box>
                        {decisionLog && (
                          <Alert severity="info" sx={{ mb: 2 }} icon={false}>
                            <Typography variant="subtitle2" gutterBottom>
                              <strong>
                                Pairing Decisions (Round{" "}
                                {typeof selectedRound === "number"
                                  ? selectedRound
                                  : "N/A"}
                                )
                              </strong>
                            </Typography>
                            {decisionLog.byeReason && (
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                <strong>Bye:</strong>{" "}
                                {decisionLog.byePlayerName &&
                                decisionLog.byePlayerPoints !== undefined ? (
                                  <>
                                    <strong>
                                      {decisionLog.byePlayerName} (
                                      {decisionLog.byePlayerPoints} pts at time
                                      of pairing)
                                    </strong>
                                    {" - "}
                                    {decisionLog.byeReason}
                                  </>
                                ) : (
                                  decisionLog.byeReason
                                )}
                              </Typography>
                            )}
                            {decisionLog.floatDetails &&
                              decisionLog.floatDetails.length > 0 && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography
                                    variant="body2"
                                    component="span"
                                    sx={{ fontWeight: "bold" }}
                                  >
                                    Floats:
                                  </Typography>
                                  <Box
                                    component="ul"
                                    sx={{ mt: 0.5, mb: 0, pl: 2 }}
                                  >
                                    {decisionLog.floatDetails.map((detail) => (
                                      <li key={detail.playerId}>
                                        <Typography
                                          variant="body2"
                                          component="span"
                                        >
                                          <strong>
                                            {detail.playerName} (
                                            {detail.playerPoints} pts):
                                          </strong>{" "}
                                          {detail.reason}
                                        </Typography>
                                      </li>
                                    ))}
                                  </Box>
                                </Box>
                              )}
                            <Typography
                              variant="body2"
                              sx={{ mb: decisionLog.rematchCount > 0 ? 1 : 0 }}
                            >
                              <strong>Max float distance:</strong>{" "}
                              {decisionLog.maxFloatDistance} point
                              {decisionLog.maxFloatDistance !== 1 ? "s" : ""}
                              {decisionLog.maxFloatDistance > 1
                                ? " (multi-step)"
                                : ""}
                            </Typography>
                            {decisionLog.rematchCount > 0 && (
                              <Typography variant="body2">
                                <strong>Rematches:</strong> Stage{" "}
                                {decisionLog.stageUsed} required (stages 1-3
                                incomplete - mathematically unavoidable)
                              </Typography>
                            )}
                            {decisionLog.rematchCount === 0 && (
                              <Typography variant="body2" color="success.main">
                                ✓ No rematches required
                              </Typography>
                            )}
                          </Alert>
                        )}
                        {(showBeginRound ||
                          canShowNextRound ||
                          canCompleteTournament) && (
                          <Box
                            sx={{
                              mb: 2,
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 1,
                            }}
                          >
                            {showBeginRound && (
                              <Button
                                variant="contained"
                                color="primary"
                                startIcon={<PlayArrowIcon />}
                                onClick={handleBeginRound}
                                disabled={processingRound}
                              >
                                Begin Round
                              </Button>
                            )}
                            {canShowNextRound && (
                              <Tooltip
                                title={
                                  !nextRoundAlreadyExists &&
                                  !canProceedToNextRound
                                    ? "Complete all matches in this round to proceed to the next round"
                                    : ""
                                }
                                arrow
                              >
                                <span>
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<ArrowForwardIcon />}
                                    onClick={handleNextRound}
                                    disabled={
                                      processingRound ||
                                      (!nextRoundAlreadyExists &&
                                        !canProceedToNextRound)
                                    }
                                  >
                                    {nextRoundAlreadyExists
                                      ? "View Next Round"
                                      : "Create Next Round"}
                                  </Button>
                                </span>
                              </Tooltip>
                            )}
                            {canCompleteTournament && (
                              <Button
                                variant="contained"
                                color="success"
                                startIcon={<CheckCircleIcon />}
                                onClick={handleCompleteTournament}
                                disabled={processingRound}
                                sx={{
                                  backgroundColor: "success.main",
                                  "&:hover": {
                                    backgroundColor: "success.dark",
                                  },
                                }}
                              >
                                Complete Tournament
                              </Button>
                            )}
                          </Box>
                        )}
                        <TableContainer>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell
                                  sortDirection={
                                    sortBy === "match" ? sortOrder : false
                                  }
                                >
                                  <TableSortLabel
                                    active={sortBy === "match"}
                                    direction={
                                      sortBy === "match" ? sortOrder : "asc"
                                    }
                                    onClick={() => handleSort("match")}
                                  >
                                    Match #
                                  </TableSortLabel>
                                </TableCell>
                                <TableCell>Player 1</TableCell>
                                <TableCell>Player 2</TableCell>
                                <TableCell
                                  sortDirection={
                                    sortBy === "status" ? sortOrder : false
                                  }
                                >
                                  <TableSortLabel
                                    active={sortBy === "status"}
                                    direction={
                                      sortBy === "status" ? sortOrder : "asc"
                                    }
                                    onClick={() => handleSort("status")}
                                  >
                                    Status
                                  </TableSortLabel>
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {roundMatches.map((match) => {
                                const canEdit =
                                  match.status === "pending" &&
                                  match.player2_id !== null;
                                const matchNumber =
                                  matchNumberById.get(match.id) ?? 0;

                                // Get effective result from pending state or match state
                                const pendingResult = pendingResults.get(
                                  match.id,
                                );
                                const effectiveWinnerId = pendingResult
                                  ? pendingResult.winnerId
                                  : match.winner_id;
                                const effectiveResult = pendingResult
                                  ? pendingResult.result
                                  : match.result;

                                // Determine background color for Player 1
                                const getPlayer1BgColor = () => {
                                  if (
                                    match.status === "bye" ||
                                    !match.player2_id
                                  ) {
                                    return "rgba(33, 150, 243, 0.1)"; // Blue for bye
                                  }
                                  if (effectiveResult === "Draw") {
                                    return "rgba(255, 152, 0, 0.1)"; // Orange for draw
                                  }
                                  if (effectiveWinnerId === match.player1_id) {
                                    return "rgba(76, 175, 80, 0.1)"; // Green for winner
                                  }
                                  if (effectiveWinnerId === match.player2_id) {
                                    return "rgba(244, 67, 54, 0.1)"; // Red for loser
                                  }
                                  return "transparent";
                                };

                                // Determine background color for Player 2
                                const getPlayer2BgColor = () => {
                                  if (
                                    match.status === "bye" ||
                                    !match.player2_id
                                  ) {
                                    return "rgba(33, 150, 243, 0.1)"; // Blue for bye
                                  }
                                  if (effectiveResult === "Draw") {
                                    return "rgba(255, 152, 0, 0.1)"; // Orange for draw
                                  }
                                  if (effectiveWinnerId === match.player2_id) {
                                    return "rgba(76, 175, 80, 0.1)"; // Green for winner
                                  }
                                  if (effectiveWinnerId === match.player1_id) {
                                    return "rgba(244, 67, 54, 0.1)"; // Red for loser
                                  }
                                  return "transparent";
                                };

                                return (
                                  <TableRow key={match.id}>
                                    <TableCell>{matchNumber}</TableCell>
                                    <TableCell
                                      sx={{
                                        backgroundColor: getPlayer1BgColor(),
                                      }}
                                    >
                                      <Box
                                        display="flex"
                                        flexDirection="column"
                                        gap={0.5}
                                      >
                                        <Box>
                                          <Typography variant="body2">
                                            {match.player1_name}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            {(() => {
                                              const s = standingsByPlayerId.get(
                                                match.player1_id,
                                              );
                                              const wins = s?.wins ?? 0;
                                              const losses = s?.losses ?? 0;
                                              const draws = s?.draws ?? 0;
                                              const pts = s?.matchPoints ?? 0;
                                              return `${wins}-${losses}-${draws} • ${pts} pts`;
                                            })()}
                                          </Typography>
                                        </Box>
                                        {match.player2_id && (
                                          <Box
                                            display="flex"
                                            gap={0.5}
                                            flexWrap="wrap"
                                          >
                                            <Chip
                                              label="1-0"
                                              size="small"
                                              variant={
                                                effectiveWinnerId ===
                                                match.player1_id
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "success.main",
                                                color:
                                                  effectiveWinnerId ===
                                                  match.player1_id
                                                    ? "white"
                                                    : "success.main",
                                                backgroundColor:
                                                  effectiveWinnerId ===
                                                  match.player1_id
                                                    ? "success.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveWinnerId ===
                                                        match.player1_id
                                                          ? "success.dark"
                                                          : "success.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(
                                                  match,
                                                  "player1",
                                                )
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                            <Chip
                                              label="Draw"
                                              size="small"
                                              variant={
                                                effectiveResult === "Draw"
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "warning.main",
                                                color:
                                                  effectiveResult === "Draw"
                                                    ? "white"
                                                    : "warning.main",
                                                backgroundColor:
                                                  effectiveResult === "Draw"
                                                    ? "warning.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveResult ===
                                                        "Draw"
                                                          ? "warning.dark"
                                                          : "warning.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(match, "draw")
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                            <Chip
                                              label="0-1"
                                              size="small"
                                              variant={
                                                effectiveWinnerId ===
                                                match.player2_id
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "error.main",
                                                color:
                                                  effectiveWinnerId ===
                                                  match.player2_id
                                                    ? "white"
                                                    : "error.main",
                                                backgroundColor:
                                                  effectiveWinnerId ===
                                                  match.player2_id
                                                    ? "error.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveWinnerId ===
                                                        match.player2_id
                                                          ? "error.dark"
                                                          : "error.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(
                                                  match,
                                                  "player2",
                                                )
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                          </Box>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        backgroundColor: getPlayer2BgColor(),
                                      }}
                                    >
                                      {match.player2_name ? (
                                        <Box
                                          display="flex"
                                          flexDirection="column"
                                          gap={0.5}
                                        >
                                          <Box>
                                            <Typography variant="body2">
                                              {match.player2_name}
                                            </Typography>
                                            <Typography
                                              variant="caption"
                                              color="text.secondary"
                                            >
                                              {(() => {
                                                const s = match.player2_id
                                                  ? standingsByPlayerId.get(
                                                      match.player2_id,
                                                    )
                                                  : undefined;
                                                const wins = s?.wins ?? 0;
                                                const losses = s?.losses ?? 0;
                                                const draws = s?.draws ?? 0;
                                                const pts = s?.matchPoints ?? 0;
                                                return `${wins}-${losses}-${draws} • ${pts} pts`;
                                              })()}
                                            </Typography>
                                          </Box>
                                          <Box
                                            display="flex"
                                            gap={0.5}
                                            flexWrap="wrap"
                                          >
                                            <Chip
                                              label="1-0"
                                              size="small"
                                              variant={
                                                effectiveWinnerId ===
                                                match.player2_id
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "success.main",
                                                color:
                                                  effectiveWinnerId ===
                                                  match.player2_id
                                                    ? "white"
                                                    : "success.main",
                                                backgroundColor:
                                                  effectiveWinnerId ===
                                                  match.player2_id
                                                    ? "success.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveWinnerId ===
                                                        match.player2_id
                                                          ? "success.dark"
                                                          : "success.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(
                                                  match,
                                                  "player2",
                                                )
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                            <Chip
                                              label="Draw"
                                              size="small"
                                              variant={
                                                effectiveResult === "Draw"
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "warning.main",
                                                color:
                                                  effectiveResult === "Draw"
                                                    ? "white"
                                                    : "warning.main",
                                                backgroundColor:
                                                  effectiveResult === "Draw"
                                                    ? "warning.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveResult ===
                                                        "Draw"
                                                          ? "warning.dark"
                                                          : "warning.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(match, "draw")
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                            <Chip
                                              label="0-1"
                                              size="small"
                                              variant={
                                                effectiveWinnerId ===
                                                match.player1_id
                                                  ? "filled"
                                                  : "outlined"
                                              }
                                              sx={{
                                                borderColor: "error.main",
                                                color:
                                                  effectiveWinnerId ===
                                                  match.player1_id
                                                    ? "white"
                                                    : "error.main",
                                                backgroundColor:
                                                  effectiveWinnerId ===
                                                  match.player1_id
                                                    ? "error.main"
                                                    : "transparent",
                                                cursor: canEdit
                                                  ? "pointer"
                                                  : "default",
                                                opacity: canEdit ? 1 : 0.7,
                                                "&:hover": canEdit
                                                  ? {
                                                      backgroundColor:
                                                        effectiveWinnerId ===
                                                        match.player1_id
                                                          ? "error.dark"
                                                          : "error.light",
                                                      color: "white",
                                                    }
                                                  : {},
                                              }}
                                              onClick={() =>
                                                handleQuickResult(
                                                  match,
                                                  "player1",
                                                )
                                              }
                                              disabled={
                                                !canEdit || updatingMatch
                                              }
                                            />
                                          </Box>
                                        </Box>
                                      ) : (
                                        <Chip
                                          label="Bye"
                                          size="small"
                                          color="info"
                                          variant="outlined"
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        label={
                                          match.status === "bye"
                                            ? "Bye"
                                            : match.status === "completed"
                                            ? "Completed"
                                            : match.status === "pending"
                                            ? "Pending"
                                            : "Ready"
                                        }
                                        size="small"
                                        color={
                                          match.status === "bye"
                                            ? "info"
                                            : match.status === "completed"
                                            ? "success"
                                            : match.status === "pending"
                                            ? "warning"
                                            : "default"
                                        }
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    ) : (
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        gap={2}
                        py={4}
                      >
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          Pairings not yet generated
                        </Typography>
                        {tournament.status === "active" &&
                          selectedRound === 1 && (
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={handleRegenerateRound1}
                              disabled={processingRound}
                              startIcon={<PlayArrowIcon />}
                            >
                              {processingRound
                                ? "Generating pairings..."
                                : "Generate Round 1 Pairings"}
                            </Button>
                          )}
                      </Box>
                    );
                  })()}
                </Box>
              </>
            );
          })()}
        </Paper>
      )}

      {/* Score Entry Dialog */}
      <Dialog
        open={scoreDialogOpen}
        onClose={handleCloseScoreDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record Match Result</DialogTitle>
        <DialogContent>
          {selectedMatch && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="body1" gutterBottom>
                <strong>Match:</strong> {selectedMatch.player1_name} vs{" "}
                {selectedMatch.player2_name || "Bye"}
              </Typography>
              <FormControl component="fieldset" sx={{ mt: 3, mb: 2 }}>
                <FormLabel component="legend">Select Winner</FormLabel>
                <RadioGroup
                  value={selectedWinner}
                  onChange={(e) => {
                    setSelectedWinner(e.target.value);
                    setError(null); // Clear error when winner changes
                  }}
                >
                  {selectedMatch.player2_id && (
                    <>
                      <FormControlLabel
                        value="player1"
                        control={<Radio />}
                        label={selectedMatch.player1_name}
                      />
                      <FormControlLabel
                        value="player2"
                        control={<Radio />}
                        label={selectedMatch.player2_name}
                      />
                      <FormControlLabel
                        value="draw"
                        control={<Radio />}
                        label="Draw"
                      />
                    </>
                  )}
                  {!selectedMatch.player2_id && (
                    <FormControlLabel
                      value="player1"
                      control={<Radio />}
                      label={`${selectedMatch.player1_name} (Bye)`}
                      checked={true}
                    />
                  )}
                </RadioGroup>
              </FormControl>
              {selectedMatch.player2_id && selectedWinner !== "draw" && (
                <Box sx={{ mt: 3 }}>
                  <FormLabel component="legend" sx={{ mb: 2 }}>
                    Game Wins
                  </FormLabel>
                  <Box display="flex" gap={2} alignItems="center">
                    <FormControl variant="outlined" sx={{ flex: 1 }}>
                      <InputLabel>{selectedMatch.player1_name}</InputLabel>
                      <OutlinedInput
                        type="number"
                        value={player1Wins}
                        onChange={(e) => {
                          setPlayer1Wins(
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 3 }}
                        endAdornment={
                          <InputAdornment position="end">wins</InputAdornment>
                        }
                        label={selectedMatch.player1_name}
                        error={
                          selectedWinner === "player1" &&
                          player1Wins <= player2Wins &&
                          player1Wins + player2Wins > 0
                        }
                      />
                    </FormControl>
                    <Typography variant="h6">-</Typography>
                    <FormControl variant="outlined" sx={{ flex: 1 }}>
                      <InputLabel>{selectedMatch.player2_name}</InputLabel>
                      <OutlinedInput
                        type="number"
                        value={player2Wins}
                        onChange={(e) => {
                          setPlayer2Wins(
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 3 }}
                        endAdornment={
                          <InputAdornment position="end">wins</InputAdornment>
                        }
                        label={selectedMatch.player2_name}
                        error={
                          selectedWinner === "player2" &&
                          player2Wins <= player1Wins &&
                          player1Wins + player2Wins > 0
                        }
                      />
                    </FormControl>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    Score will be displayed as: {player1Wins}-{player2Wins}
                  </Typography>
                  {(() => {
                    const validationError = getScoreValidationError();
                    return validationError ? (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        {validationError}
                      </Alert>
                    ) : null;
                  })()}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseScoreDialog} disabled={updatingMatch}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveMatchResult}
            variant="contained"
            disabled={
              updatingMatch ||
              !selectedWinner ||
              getScoreValidationError() !== null
            }
          >
            {updatingMatch ? "Saving..." : "Save Result"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TournamentMatches;
