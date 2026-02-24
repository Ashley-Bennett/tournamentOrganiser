import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
  Select,
  MenuItem,
  IconButton,
  Switch,
  TextField,
} from "@mui/material";
import PageLoading from "../components/PageLoading";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import PushPinIcon from "@mui/icons-material/PushPin";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import {
  generateSwissPairings,
  calculateMatchPoints,
  type Pairing,
  type PairingDecisionLog,
} from "../utils/tournamentPairing";
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches, assignMatchNumbers, type SeatConflict } from "../utils/tournamentUtils";

interface TournamentPlayer {
  id: string;
  name: string;
  dropped: boolean;
  dropped_at_round: number | null;
  has_static_seating: boolean;
  static_seat_number: number | null;
}

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
  match_number: number | null;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  temp_winner_id: string | null;
  temp_result: string | null;
  status: "ready" | "pending" | "completed" | "bye";
  pairing_decision_log?: PairingDecisionLog | null;
  created_at: string;
}

interface MatchWithPlayers extends Match {
  player1_name: string;
  player2_name: string | null;
  winner_name: string | null;
}


const MATCH_STATUS = {
  READY: "ready",
  PENDING: "pending",
  COMPLETED: "completed",
  BYE: "bye",
} as const;

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
  const [seatWarnings, setSeatWarnings] = useState<string[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);
  const [sortBy, setSortBy] = useState<"match" | "status" | "record">("record");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
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
  const [editingPairings, setEditingPairings] = useState(false);
  // matchId → { player1Id: string|null, player2Id: string|null }; null = slot emptied
  const [editedPairings, setEditedPairings] = useState<
    Map<string, { player1Id: string | null; player2Id: string | null }>
  >(new Map());
  const [savingPairings, setSavingPairings] = useState(false);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [togglingDrop, setTogglingDrop] = useState<string | null>(null);
  const [savingSeat, setSavingSeat] = useState<string | null>(null);
  const didRestoreRef = useRef(false);

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
        byesReceived: number;
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
          byesReceived: 0,
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
          byesReceived: 0,
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
        p1.byesReceived += 1;
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

  // All players appearing in the current round's matches (for the pairing editor)
  const roundPlayers = useMemo(() => {
    const seen = new Map<string, string>();
    matches
      .filter(
        (m) =>
          typeof selectedRound === "number" &&
          m.round_number === selectedRound,
      )
      .forEach((m) => {
        seen.set(m.player1_id, m.player1_name);
        if (m.player2_id && m.player2_name)
          seen.set(m.player2_id, m.player2_name);
      });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [matches, selectedRound]);

  // Players not currently assigned to any slot in editedPairings
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

  // Save is only enabled when every player is assigned exactly once (pool is empty)
  const pairingEditsValid = useMemo(() => {
    if (!editingPairings) return true;
    if (availablePool.size > 0) return false;
    return Array.from(editedPairings.values()).every(
      (e) => e.player1Id !== null,
    );
  }, [editingPairings, availablePool, editedPairings]);

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



  // Restore pending results from DB temp columns when matches first load
  useEffect(() => {
    if (matches.length === 0 || didRestoreRef.current) return;
    didRestoreRef.current = true;
    const toRestore = new Map<string, { winnerId: string | null; result: string }>();
    for (const match of matches) {
      if (match.status !== "completed" && match.status !== "bye" && match.temp_result) {
        toRestore.set(match.id, {
          winnerId: match.temp_winner_id,
          result: match.temp_result,
        });
      }
    }
    if (toRestore.size > 0) setPendingResults(toRestore);
  }, [matches]);

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

        // Load all tournament players (with drop status) for the drop manager
        const { data: allPlayersData } = await supabase
          .from("tournament_players")
          .select("id, name, dropped, dropped_at_round, has_static_seating, static_seat_number")
          .eq("tournament_id", tournament.id)
          .order("name");
        setPlayers((allPlayersData as TournamentPlayer[]) ?? []);

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
    return sortByTieBreakers(buildStandingsFromMatches(matches));
  }, [matches]);

  // Map from player ID → standing (all completed matches), used in the drop dialog
  const finalStandingsById = useMemo(() => {
    const map = new Map<string, (typeof finalStandings)[0]>();
    for (const s of finalStandings) map.set(s.id, s);
    return map;
  }, [finalStandings]);

  // Map from player ID → dropped_at_round (for final standings table indicators)
  const droppedPlayersMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of players) {
      if (p.dropped) map.set(p.id, p.dropped_at_round);
    }
    return map;
  }, [players]);

  // Map from player ID → static seating info (for match card pin indicator)
  const playerStaticSeatMap = useMemo(() => {
    const map = new Map<string, { hasStaticSeating: boolean; seatNumber: number | null }>();
    for (const p of players) {
      map.set(p.id, { hasStaticSeating: p.has_static_seating, seatNumber: p.static_seat_number });
    }
    return map;
  }, [players]);

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

    // Draws are not permitted in single-elimination
    if (
      selectedWinner === "draw" &&
      tournament?.tournament_type === "single_elimination"
    ) {
      return "Draws are not allowed in single-elimination tournaments";
    }

    // Validate score for non-draw matches
    if (selectedWinner !== "draw" && selectedMatch.player2_id) {
      if (player1Wins === 0 && player2Wins === 0) {
        return "Please enter a valid score";
      }
      // Best-of-3: max 2 wins per player, max 3 games total
      if (player1Wins > 2 || player2Wins > 2) {
        return "Maximum 2 wins per player (best of 3)";
      }
      if (player1Wins + player2Wins > 3) {
        return "Maximum 3 games total (best of 3)";
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

  const handleQuickResult = async (
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

    setPendingResults((prev) => {
      const next = new Map(prev);
      next.set(match.id, { winnerId, result: resultString });
      return next;
    });

    // Auto-save temp result to DB so it survives navigation
    const { error } = await supabase
      .from("tournament_matches")
      .update({ temp_winner_id: winnerId, temp_result: resultString })
      .eq("id", match.id);
    if (error) {
      console.error("Failed to auto-save temp result:", error.message);
    }
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

  // Shared helper: fetch all tournament matches (with player names) and update state
  const refreshMatches = async () => {
    if (!tournament) return;
    const { data: matchesData, error: matchesError } = await supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournament.id)
      .order("round_number", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (matchesError)
      throw new Error(matchesError.message || "Failed to refresh matches");

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

    const { data: freshPlayers } = await supabase
      .from("tournament_players")
      .select("id, name, dropped, dropped_at_round, has_static_seating, static_seat_number")
      .eq("tournament_id", tournament.id)
      .order("name");
    setPlayers((freshPlayers as TournamentPlayer[]) ?? []);
  };

  // ── Drop manager ─────────────────────────────────────────────────────────────

  const handleToggleDrop = async (
    playerId: string,
    currentlyDropped: boolean,
  ) => {
    if (!tournament) return;
    setTogglingDrop(playerId);
    try {
      const nowDropped = !currentlyDropped;
      const { error } = await supabase
        .from("tournament_players")
        .update({
          dropped: nowDropped,
          dropped_at_round: nowDropped
            ? typeof selectedRound === "number"
              ? selectedRound
              : null
            : null,
        })
        .eq("id", playerId);
      if (error) throw new Error(error.message || "Failed to update drop status");

      const { data: fresh } = await supabase
        .from("tournament_players")
        .select("id, name, dropped, dropped_at_round, has_static_seating, static_seat_number")
        .eq("tournament_id", tournament.id)
        .order("name");
      setPlayers((fresh as TournamentPlayer[]) ?? []);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to update drop status",
      );
    } finally {
      setTogglingDrop(null);
    }
  };

  const handleUpdateStaticSeat = async (
    playerId: string,
    hasStaticSeating: boolean,
    seatNumber: number | null,
  ) => {
    if (!tournament) return;
    setSavingSeat(playerId);
    try {
      const { error } = await supabase
        .from("tournament_players")
        .update({
          has_static_seating: hasStaticSeating,
          static_seat_number: hasStaticSeating ? seatNumber : null,
        })
        .eq("id", playerId);
      if (error) throw new Error(error.message || "Failed to update seating");

      const { data: fresh } = await supabase
        .from("tournament_players")
        .select("id, name, dropped, dropped_at_round, has_static_seating, static_seat_number")
        .eq("tournament_id", tournament.id)
        .order("name");
      setPlayers((fresh as TournamentPlayer[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update seating");
    } finally {
      setSavingSeat(null);
    }
  };

  // ── Pairing editor ──────────────────────────────────────────────────────────

  const handleEditPairings = () => {
    const initial = new Map<
      string,
      { player1Id: string | null; player2Id: string | null }
    >();
    matches
      .filter(
        (m) =>
          typeof selectedRound === "number" &&
          m.round_number === selectedRound,
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
    setSavingPairings(true);
    setError(null);
    try {
      const currentRoundMatches = matches.filter(
        (m) =>
          typeof selectedRound === "number" &&
          m.round_number === selectedRound,
      );
      for (const match of currentRoundMatches) {
        const edited = editedPairings.get(match.id);
        if (!edited || edited.player1Id === null) continue;
        const p1Changed = edited.player1Id !== match.player1_id;
        const p2Changed = edited.player2Id !== match.player2_id;
        // Also update matches that are still in legacy "bye" status so they
        // get reset to "ready" and are re-processed by handleBeginRound.
        const isLegacyBye = match.status === MATCH_STATUS.BYE;
        if (!p1Changed && !p2Changed && !isLegacyBye) continue;

        // Always save as "ready" — handleBeginRound will auto-complete byes when
        // the round starts. This keeps pairings editable until Begin Round.
        const { error: updateError } = await supabase
          .from("tournament_matches")
          .update({
            player1_id: edited.player1Id,
            player2_id: edited.player2Id,
            status: MATCH_STATUS.READY,
            result: null,
            winner_id: null,
          })
          .eq("id", match.id);
        if (updateError)
          throw new Error(
            updateError.message || "Failed to update pairing",
          );
      }
      await refreshMatches();
      setEditingPairings(false);
      setEditedPairings(new Map());
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to save pairing edits",
      );
    } finally {
      setSavingPairings(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────

  const handleBeginRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);
      if (typeof selectedRound !== "number") return;

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
      setSeatWarnings([]);

      // Fetch all players for the tournament
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
      // Byes are created as "ready" so the organiser can edit pairings before beginning the round.
      // handleBeginRound will auto-complete them when the round starts.

      // Build static seat map and assign table numbers
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
      setSeatWarnings([]);

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

      // Ensure all matches in the current round are completed or bye before proceeding
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

      // Fetch all tournament players (including drop status) so we can seed
      // standings correctly and exclude dropped players from the next round.
      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name, dropped, dropped_at_round, has_static_seating, static_seat_number")
        .eq("tournament_id", tournament.id);

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      // Calculate standings from all previous matches, seeding from full player list
      const standings = buildStandingsFromMatches(
        allPreviousMatches,
        playersData ?? [],
      );

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
        tournament.tournament_type === "single_elimination" &&
        nextRoundNumber > 1
          ? standings.filter((s) => s.losses === 0)
          : standings;

      // Exclude dropped players from the pairing pool
      const droppedIds = new Set(
        playersData?.filter((p) => p.dropped).map((p) => p.id) ?? [],
      );
      const standingsToUse = standingsForPairing.filter(
        (s) => !droppedIds.has(s.id),
      );

      if (standingsToUse.length < 2) {
        throw new Error(
          "Not enough active (non-dropped) players remaining to generate pairings",
        );
      }

      // Generate pairings for next round
      const pairingResult = generateSwissPairings(
        standingsToUse,
        nextRoundNumber,
        previousPairings,
      );

      // Create matches in database
      // Pairings are already sorted with byes at the end by generateSwissPairings
      // Store decision log on the first match of the round.
      // Byes are created as "ready" so the organiser can edit pairings before beginning the round.

      // Build static seat map and assign table numbers
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
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center">
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
        {tournament.status === "active" && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => setDropDialogOpen(true)}
          >
            Manage Players
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {seatWarnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setSeatWarnings([])}>
          {seatWarnings.length === 1
            ? seatWarnings[0]
            : seatWarnings.map((w, i) => <div key={i}>{w}</div>)}
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
                    const completedCount = roundMatches.filter(
                      (m) => m.status === "completed" || m.status === "bye",
                    ).length;
                    const allDone =
                      hasMatches && completedCount === roundMatches.length;
                    const hasPendingForRound =
                      hasMatches &&
                      roundMatches.some((m) => pendingResults.has(m.id));

                    let indicator: ReactNode = null;
                    if (hasMatches) {
                      if (allDone) {
                        indicator = (
                          <Box
                            component="span"
                            sx={{ color: "success.main", ml: 0.5, lineHeight: 1 }}
                          >
                            ✓
                          </Box>
                        );
                      } else if (hasPendingForRound) {
                        indicator = (
                          <Box
                            component="span"
                            sx={{
                              display: "inline-block",
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              backgroundColor: "warning.main",
                              ml: 0.75,
                              verticalAlign: "middle",
                              mb: "1px",
                            }}
                          />
                        );
                      } else if (completedCount > 0) {
                        indicator = (
                          <Box
                            component="span"
                            sx={{
                              color: "text.secondary",
                              ml: 0.5,
                              fontSize: "0.7rem",
                            }}
                          >
                            {completedCount}/{roundMatches.length}
                          </Box>
                        );
                      }
                    }

                    return (
                      <Tab
                        key={roundNumber}
                        label={
                          <Box display="flex" alignItems="center">
                            {`Round ${roundNumber}`}
                            {indicator}
                          </Box>
                        }
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
                                    const droppedAtRound = droppedPlayersMap.get(player.id);
                                    const isDropped = droppedPlayersMap.has(player.id);
                                    return (
                                      <TableRow
                                        key={player.id}
                                        sx={{
                                          opacity: isDropped ? 0.7 : 1,
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
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="flex-end"
                                            gap={1}
                                            sx={{ flexWrap: "nowrap" }}
                                          >
                                            {isDropped && (
                                              <Chip
                                                label={`Dropped Rd ${droppedAtRound ?? "?"}`}
                                                size="small"
                                                variant="outlined"
                                                color="default"
                                                sx={{ whiteSpace: "nowrap" }}
                                              />
                                            )}
                                            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                                              {player.wins}-{player.losses}-
                                              {player.draws}
                                            </Typography>
                                          </Box>
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
                    const currentRoundPendingCount = roundMatchesForState.filter(
                      (m) => pendingResults.has(m.id),
                    ).length;
                    const hasReadyMatches = roundMatchesForState.some(
                      (m) => m.status === "ready",
                    );
                    const hasPendingMatches = roundMatchesForState.some(
                      (m) => m.status === "pending",
                    );
                    // All matches have results (either saved to DB or pending in UI)
                    const allResultsEntered =
                      roundMatchesForState.length > 0 &&
                      roundMatchesForState.every((m) => {
                        if (m.status === "bye") return true;
                        if (m.status === "completed") return true;
                        return pendingResults.has(m.id);
                      });
                    // All matches are saved to DB (no pending UI results outstanding)
                    const allCompletedInDB =
                      roundMatchesForState.length > 0 &&
                      roundMatchesForState.every(
                        (m) => m.status === "completed" || m.status === "bye",
                      );
                    const canShowNextRound =
                      tournament.num_rounds &&
                      typeof selectedRound === "number" &&
                      selectedRound < tournament.num_rounds;
                    // Only allow proceeding once results are in the DB (so Manage Drops sees current standings)
                    const canProceedToNextRound =
                      allCompletedInDB && canShowNextRound;
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
                    const canCompleteTournament = isFinalRound && allCompletedInDB;

                    // Build match number map: prefer stored match_number from DB (assigned at pairing
                    // creation time so table numbers are stable across sessions). Fall back to
                    // ranking-based computation for legacy matches that pre-date this column.
                    const matchNumberById = new Map<string, number>();
                    if (baseMatches.every((m) => m.match_number != null)) {
                      // All matches have a stored number — use them directly
                      baseMatches.forEach((m) =>
                        matchNumberById.set(m.id, m.match_number!),
                      );
                    } else {
                      // Legacy fallback: sort by ranking and assign 1-based index
                      const rankedForNumbering = [...baseMatches].sort((a, b) => {
                        const aIsBye = a.player2_id === null;
                        const bIsBye = b.player2_id === null;
                        if (aIsBye && !bIsBye) return 1;
                        if (!aIsBye && bIsBye) return -1;
                        if (aIsBye && bIsBye) {
                          const aPts = standingsByPlayerId.get(a.player1_id)?.matchPoints ?? 0;
                          const bPts = standingsByPlayerId.get(b.player1_id)?.matchPoints ?? 0;
                          if (aPts !== bPts) return aPts - bPts;
                          return a.player1_id.localeCompare(b.player1_id);
                        }
                        const a1 = standingsByPlayerId.get(a.player1_id)?.matchPoints ?? 0;
                        const a2 = standingsByPlayerId.get(a.player2_id!)?.matchPoints ?? 0;
                        const b1 = standingsByPlayerId.get(b.player1_id)?.matchPoints ?? 0;
                        const b2 = standingsByPlayerId.get(b.player2_id!)?.matchPoints ?? 0;
                        const aTop = Math.max(a1, a2);
                        const bTop = Math.max(b1, b2);
                        if (aTop !== bTop) return bTop - aTop;
                        const aSum = a1 + a2;
                        const bSum = b1 + b2;
                        if (aSum !== bSum) return bSum - aSum;
                        return `${a.player1_id}-${a.player2_id}`.localeCompare(`${b.player1_id}-${b.player2_id}`);
                      });
                      rankedForNumbering.forEach((m, i) =>
                        matchNumberById.set(m.id, i + 1),
                      );
                    }

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
                    } else if (sortBy === "record") {
                      // Sort by combined match points of both players, byes last
                      roundMatches.sort((a, b) => {
                        const aIsBye =
                          a.status === "bye" || a.player2_id === null;
                        const bIsBye =
                          b.status === "bye" || b.player2_id === null;
                        if (aIsBye && !bIsBye) return 1;
                        if (!aIsBye && bIsBye) return -1;

                        const ptsA =
                          (standingsByPlayerId.get(a.player1_id)?.matchPoints ?? 0) +
                          (a.player2_id ? standingsByPlayerId.get(a.player2_id)?.matchPoints ?? 0 : 0);
                        const ptsB =
                          (standingsByPlayerId.get(b.player1_id)?.matchPoints ?? 0) +
                          (b.player2_id ? standingsByPlayerId.get(b.player2_id)?.matchPoints ?? 0 : 0);
                        const cmp = ptsA - ptsB;
                        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
                        // Tiebreak by match number
                        return getMatchNum(a) - getMatchNum(b);
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

                    const handleSort = (column: "match" | "status" | "record") => {
                      setSortBy(column);
                      setSortOrder((prev) =>
                        sortBy === column
                          ? prev === "asc"
                            ? "desc"
                            : "asc"
                          : column === "record"
                            ? "desc"
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
                            {decisionLog.seatConflicts &&
                              decisionLog.seatConflicts.length > 0 && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography
                                    variant="body2"
                                    component="span"
                                    sx={{ fontWeight: "bold" }}
                                  >
                                    Seat conflicts:
                                  </Typography>
                                  <Box
                                    component="ul"
                                    sx={{ mt: 0.5, mb: 0, pl: 2 }}
                                  >
                                    {decisionLog.seatConflicts.map((sc, i) => (
                                      <li key={i}>
                                        <Typography
                                          variant="body2"
                                          component="span"
                                        >
                                          <strong>{sc.movedPlayerName}</strong>{" "}
                                          moved from table {sc.movedPlayerOriginalSeat} to table{" "}
                                          {sc.resolvedSeat} — paired against{" "}
                                          <strong>{sc.opponentName}</strong> who
                                          has static seating at table{" "}
                                          {sc.opponentSeat} (lower seat wins)
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
                                <strong>Rematches:</strong> Occurred in this
                                round (pairing minimizes rematches within
                                bracket-first rules)
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
                          (hasPendingMatches && !allCompletedInDB) ||
                          canProceedToNextRound ||
                          canCompleteTournament ||
                          editingPairings) && (
                          <Box
                            sx={{
                              mb: 2,
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 1,
                            }}
                          >
                            {editingPairings ? (
                              <>
                                <Button
                                  variant="outlined"
                                  onClick={handleCancelEditPairings}
                                  disabled={savingPairings}
                                >
                                  Cancel
                                </Button>
                                <Tooltip
                                  title={
                                    !pairingEditsValid && availablePool.size > 0
                                      ? `Assign ${[...availablePool.values()].join(", ")} before saving`
                                      : ""
                                  }
                                  arrow
                                >
                                  <span>
                                    <Button
                                      variant="contained"
                                      color="success"
                                      disabled={!pairingEditsValid || savingPairings}
                                      onClick={handleSavePairingEdits}
                                    >
                                      Save Pairings
                                    </Button>
                                  </span>
                                </Tooltip>
                              </>
                            ) : (
                              <>
                                {/* Phase 1: pairings ready, round not yet started */}
                                {showBeginRound && (
                                  <>
                                    <Button
                                      variant="outlined"
                                      startIcon={<EditIcon />}
                                      onClick={handleEditPairings}
                                    >
                                      Edit Pairings
                                    </Button>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      startIcon={<PlayArrowIcon />}
                                      onClick={handleBeginRound}
                                      disabled={processingRound}
                                    >
                                      Begin Round
                                    </Button>
                                  </>
                                )}
                                {/* Phase 2: round active — greyed until all results entered */}
                                {hasPendingMatches && !allCompletedInDB && (
                                  <Tooltip
                                    title={
                                      !allResultsEntered
                                        ? "Enter all match results to submit"
                                        : ""
                                    }
                                    arrow
                                  >
                                    <span>
                                      <Button
                                        variant="contained"
                                        color="success"
                                        disabled={!allResultsEntered || updatingMatch}
                                        onClick={() => void savePendingResults()}
                                      >
                                        {updatingMatch
                                          ? "Saving…"
                                          : `Submit Results (${currentRoundPendingCount})`}
                                      </Button>
                                    </span>
                                  </Tooltip>
                                )}
                                {/* Phase 3 (non-final): results in DB */}
                                {canShowNextRound &&
                                  !nextRoundAlreadyExists &&
                                  allCompletedInDB && (
                                  <Button
                                    variant="outlined"
                                    color="warning"
                                    onClick={() => setDropDialogOpen(true)}
                                  >
                                    Manage Players
                                  </Button>
                                )}
                                {canShowNextRound &&
                                  (nextRoundAlreadyExists || canProceedToNextRound) && (
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<ArrowForwardIcon />}
                                    onClick={handleNextRound}
                                    disabled={processingRound}
                                  >
                                    {nextRoundAlreadyExists
                                      ? "View Next Round"
                                      : "Create Next Round"}
                                  </Button>
                                )}
                                {/* Phase 3 (final): results in DB */}
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
                              </>
                            )}
                          </Box>
                        )}
                        {editingPairings && (
                          <Alert
                            severity={availablePool.size > 0 ? "warning" : "info"}
                            sx={{ mb: 1 }}
                          >
                            {availablePool.size > 0 ? (
                              <>
                                <strong>
                                  {[...availablePool.values()].join(
                                    availablePool.size === 2 ? " and " : ", ",
                                  )}
                                </strong>{" "}
                                {availablePool.size === 1 ? "needs" : "need"}{" "}
                                to be assigned to a match before you can save.
                              </>
                            ) : (
                              "Remove a player from their slot to add them to the pool, then assign them to an empty slot in another match."
                            )}
                          </Alert>
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
                                <TableCell
                                  sortDirection={
                                    sortBy === "record" ? sortOrder : false
                                  }
                                >
                                  <TableSortLabel
                                    active={sortBy === "record"}
                                    direction={
                                      sortBy === "record" ? sortOrder : "desc"
                                    }
                                    onClick={() => handleSort("record")}
                                  >
                                    Player 1
                                  </TableSortLabel>
                                </TableCell>
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

                                const p1Seat = playerStaticSeatMap.get(match.player1_id);
                                const p2Seat = match.player2_id
                                  ? playerStaticSeatMap.get(match.player2_id)
                                  : undefined;
                                const hasStaticSeating =
                                  p1Seat?.hasStaticSeating || p2Seat?.hasStaticSeating;

                                return (
                                  <TableRow key={match.id}>
                                    <TableCell>
                                      <Box display="flex" alignItems="center" gap={0.5}>
                                        {matchNumber}
                                        {hasStaticSeating && (
                                          <Tooltip title="Static seating">
                                            <PushPinIcon
                                              sx={{ fontSize: 13, color: "text.secondary", opacity: 0.7 }}
                                            />
                                          </Tooltip>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        backgroundColor:
                                          editingPairings &&
                                          (match.status === MATCH_STATUS.READY ||
                                            match.status === MATCH_STATUS.BYE)
                                            ? "transparent"
                                            : getPlayer1BgColor(),
                                      }}
                                    >
                                      {editingPairings &&
                                      (match.status === MATCH_STATUS.READY ||
                                        match.status === MATCH_STATUS.BYE) ? (
                                        (() => {
                                          const ep = editedPairings.get(
                                            match.id,
                                          );
                                          const p1Id = ep?.player1Id ?? null;
                                          const p1Name = p1Id
                                            ? (roundPlayers.find(
                                                (p) => p.id === p1Id,
                                              )?.name ?? "Unknown")
                                            : null;
                                          return p1Id ? (
                                            <Box
                                              display="flex"
                                              alignItems="center"
                                              gap={0.5}
                                            >
                                              <Typography variant="body2">
                                                {p1Name}
                                              </Typography>
                                              <IconButton
                                                size="small"
                                                onClick={() =>
                                                  removeFromSlot(
                                                    match.id,
                                                    "player1",
                                                  )
                                                }
                                              >
                                                <CloseIcon fontSize="small" />
                                              </IconButton>
                                            </Box>
                                          ) : (
                                            <Select
                                              size="small"
                                              displayEmpty
                                              value=""
                                              onChange={(e) =>
                                                assignToSlot(
                                                  match.id,
                                                  "player1",
                                                  e.target.value,
                                                )
                                              }
                                              renderValue={() => (
                                                <em>Select player…</em>
                                              )}
                                              sx={{ minWidth: 140 }}
                                            >
                                              {[
                                                ...availablePool.entries(),
                                              ].map(([id, name]) => (
                                                <MenuItem key={id} value={id}>
                                                  {name}
                                                </MenuItem>
                                              ))}
                                            </Select>
                                          );
                                        })()
                                      ) : (
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
                                      )}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        backgroundColor:
                                          editingPairings &&
                                          (match.status === MATCH_STATUS.READY ||
                                            match.status === MATCH_STATUS.BYE)
                                            ? "transparent"
                                            : getPlayer2BgColor(),
                                      }}
                                    >
                                      {editingPairings &&
                                      (match.status === MATCH_STATUS.READY ||
                                        match.status === MATCH_STATUS.BYE) ? (
                                        (() => {
                                          const ep = editedPairings.get(
                                            match.id,
                                          );
                                          const p2Id = ep?.player2Id ?? null;
                                          const p2Name = p2Id
                                            ? (roundPlayers.find(
                                                (p) => p.id === p2Id,
                                              )?.name ?? "Unknown")
                                            : null;
                                          return p2Id ? (
                                            <Box
                                              display="flex"
                                              alignItems="center"
                                              gap={0.5}
                                            >
                                              <Typography variant="body2">
                                                {p2Name}
                                              </Typography>
                                              <IconButton
                                                size="small"
                                                onClick={() =>
                                                  removeFromSlot(
                                                    match.id,
                                                    "player2",
                                                  )
                                                }
                                              >
                                                <CloseIcon fontSize="small" />
                                              </IconButton>
                                            </Box>
                                          ) : (
                                            <Select
                                              size="small"
                                              displayEmpty
                                              value=""
                                              onChange={(e) =>
                                                assignToSlot(
                                                  match.id,
                                                  "player2",
                                                  e.target.value,
                                                )
                                              }
                                              renderValue={() => (
                                                <em>
                                                  {!match.player2_id
                                                    ? "Bye — assign to pair"
                                                    : "Select player…"}
                                                </em>
                                              )}
                                              sx={{ minWidth: 160 }}
                                            >
                                              {[
                                                ...availablePool.entries(),
                                              ].map(([id, name]) => (
                                                <MenuItem key={id} value={id}>
                                                  {name}
                                                </MenuItem>
                                              ))}
                                            </Select>
                                          );
                                        })()
                                      ) : match.player2_name ? (
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
                            Math.min(2, Math.max(0, parseInt(e.target.value, 10) || 0)),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 2 }}
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
                            Math.min(2, Math.max(0, parseInt(e.target.value, 10) || 0)),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 2 }}
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

      {/* Player management dialog (drops + static seating) */}
      <Dialog
        open={dropDialogOpen}
        onClose={() => setDropDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Manage Players</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Dropped players keep their record but are excluded from future pairings.
            Static seating keeps a player at a fixed table each round.
          </Typography>
          {players.map((player, idx) => {
            const standing = finalStandingsById.get(player.id);
            const isSaving = savingSeat === player.id;
            return (
              <Box
                key={player.id}
                py={1.5}
                sx={{
                  borderBottom:
                    idx < players.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  opacity: player.dropped ? 0.65 : 1,
                }}
              >
                {/* Top row: name + record + drop button */}
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body1">{player.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {player.dropped
                        ? `Dropped after Round ${player.dropped_at_round}`
                        : `${standing?.wins ?? 0}W – ${standing?.losses ?? 0}L – ${standing?.draws ?? 0}D · ${standing?.matchPoints ?? 0} pts`}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color={player.dropped ? "success" : "error"}
                    onClick={() => handleToggleDrop(player.id, player.dropped)}
                    disabled={!!togglingDrop}
                    sx={{ ml: 2, minWidth: 80 }}
                  >
                    {togglingDrop === player.id
                      ? "…"
                      : player.dropped
                        ? "Restore"
                        : "Drop"}
                  </Button>
                </Box>
                {/* Bottom row: static seating toggle + table number input */}
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={player.has_static_seating}
                        disabled={isSaving}
                        onChange={(e) =>
                          handleUpdateStaticSeat(
                            player.id,
                            e.target.checked,
                            player.static_seat_number,
                          )
                        }
                      />
                    }
                    label={
                      <Typography variant="caption">Static seating</Typography>
                    }
                    sx={{ mr: 0 }}
                  />
                  {player.has_static_seating && (
                    <TextField
                      size="small"
                      label="Table #"
                      type="number"
                      disabled={isSaving}
                      value={player.static_seat_number ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                        handleUpdateStaticSeat(player.id, true, val);
                      }}
                      inputProps={{ min: 1, style: { width: 60 } }}
                      sx={{ width: 90 }}
                    />
                  )}
                  {isSaving && (
                    <Typography variant="caption" color="text.secondary">Saving…</Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDropDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default TournamentMatches;
