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
  Skeleton,
  Snackbar,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import PushPinIcon from "@mui/icons-material/PushPin";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PersonIcon from "@mui/icons-material/Person";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { calculateMatchPoints } from "../utils/tournamentPairing";
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches } from "../utils/tournamentUtils";
import { TournamentSummary } from "../types/tournament";
import { usePairingEditor } from "../hooks/usePairingEditor";
import { usePendingResults } from "../hooks/usePendingResults";
import { useMatchReports } from "../hooks/useMatchReports";
import { useMatchData } from "../hooks/useMatchData";
import { useRoundLifecycle } from "../hooks/useRoundLifecycle";
import {
  type TournamentPlayer,
  type Match,
  type MatchWithPlayers,
  MATCH_STATUS,
  humanizeByeReason,
  humanizeFloatReason,
} from "../types/match";
import StandingsTable from "../components/StandingsTable";
import RoundTimer from "../components/RoundTimer";

const TournamentMatches: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { workspaceId, wPath } = useWorkspace();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);
  const [sortBy, setSortBy] = useState<"match" | "status" | "record">("record");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithPlayers | null>(
    null,
  );
  const [selectedWinner, setSelectedWinner] = useState<string>("");
  const [player1Wins, setPlayer1Wins] = useState<number>(0);
  const [player2Wins, setPlayer2Wins] = useState<number>(0);
  const [updatingMatch, setUpdatingMatch] = useState(false);
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [togglingDrop, setTogglingDrop] = useState<string | null>(null);
  const [savingSeat, setSavingSeat] = useState<string | null>(null);
  const [hoveredRound, setHoveredRound] = useState<number | null>(null);
  const [deleteRoundConfirmRound, setDeleteRoundConfirmRound] = useState<
    number | null
  >(null);
  const [lateEntryDialogOpen, setLateEntryDialogOpen] = useState(false);
  const [lateEntryName, setLateEntryName] = useState("");
  const [addingLateEntry, setAddingLateEntry] = useState(false);
  const [seatInputs, setSeatInputs] = useState<Map<string, string>>(new Map());
  const [savingTimer, setSavingTimer] = useState(false);
  const [timerDurationInput, setTimerDurationInput] = useState<string | null>(
    null,
  );
  const [timerEditorOpen, setTimerEditorOpen] = useState(false);
  const [roundNoteInput, setRoundNoteInput] = useState<string>("");
  const noteInputFocusedRef = useRef(false);

  const {
    matches,
    setMatches,
    matchesLoading,
    players,
    setPlayers,
    roundDecisionLogs,
    setRefreshTrigger,
    refreshMatches,
  } = useMatchData({
    tournamentId: tournament?.id,
    user,
    setSelectedRound,
    setError,
  });

  // Sync round note input from tournament state (only when not actively editing)
  useEffect(() => {
    if (!noteInputFocusedRef.current) {
      setRoundNoteInput(tournament?.round_note ?? "");
    }
  }, [tournament?.round_note]);

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

      const isLateEntryLoss =
        m.player2_id === null &&
        m.result === "loss" &&
        m.status === "completed";
      const isBye =
        !isLateEntryLoss && (m.status === "bye" || m.player2_id === null);
      const isDraw =
        m.status === "completed" && m.winner_id === null && m.result === "Draw";
      const isCompletedWin =
        m.status === "completed" && m.winner_id !== null && m.result !== "Draw";

      if (isLateEntryLoss) {
        p1.losses += 1;
      } else if (isBye) {
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
            "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused",
          )
          .eq("id", id)
          .eq("workspace_id", workspaceId ?? "")
          .maybeSingle();

        if (error) {
          throw new Error(error.message || "Failed to load tournament");
        }
        if (!data) {
          // No error but no data — likely an expired JWT causing RLS to silently filter
          // the row. Refresh the session and retry once before showing an error.
          const {
            data: { session: freshSession },
          } = await supabase.auth.refreshSession();
          if (!freshSession) {
            navigate("/login", { replace: true });
            return;
          }
          // Retry without the workspace filter — workspaceId may be null if the
          // workspace context was also mid-refresh. RLS enforces access control.
          const { data: retryData, error: retryError } = await supabase
            .from("tournaments")
            .select(
              "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused",
            )
            .eq("id", id)
            .maybeSingle();
          if (retryError) {
            throw new Error(retryError.message || "Failed to load tournament");
          }
          if (!retryData) {
            setError("Tournament not found or you do not have access");
            setTournament(null);
          } else {
            setTournament(retryData as TournamentSummary);
          }
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
  }, [id, user, authLoading, navigate, workspaceId]);

  const { matchReports } = useMatchReports({
    tournamentId: tournament?.id,
    setRefreshTrigger,
  });

  // Map from player ID → dropped_at_round (for final standings table indicators)
  const droppedPlayersMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of players) {
      if (p.dropped) map.set(p.id, p.dropped_at_round);
    }
    return map;
  }, [players]);

  const deckPlayersMap = useMemo(() => {
    const map = new Map<string, [number | null, number | null]>();
    for (const p of players) {
      if (p.deck_pokemon1 != null || p.deck_pokemon2 != null) {
        map.set(p.id, [p.deck_pokemon1, p.deck_pokemon2]);
      }
    }
    return map;
  }, [players]);

  // Calculate final standings for leaderboard
  const finalStandings = useMemo(() => {
    if (!matches.length) return [];
    return sortByTieBreakers(
      buildStandingsFromMatches(matches),
      new Set(droppedPlayersMap.keys()),
    );
  }, [matches, droppedPlayersMap]);

  // Map from player ID → standing (all completed matches), used in the drop dialog
  const finalStandingsById = useMemo(() => {
    const map = new Map<string, (typeof finalStandings)[0]>();
    for (const s of finalStandings) map.set(s.id, s);
    return map;
  }, [finalStandings]);

  // Map from player ID → static seating info (for match card pin indicator)
  const playerStaticSeatMap = useMemo(() => {
    const map = new Map<
      string,
      { hasStaticSeating: boolean; seatNumber: number | null }
    >();
    for (const p of players) {
      map.set(p.id, {
        hasStaticSeating: p.has_static_seating,
        seatNumber: p.static_seat_number,
      });
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

  const {
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
  } = usePairingEditor({
    matches,
    selectedRound,
    tournament,
    workspaceId,
    refreshMatches,
    setError,
  });

  const {
    pendingResults,
    autoSaveWarning,
    setAutoSaveWarning,
    handleQuickResult,
    savePendingResults,
  } = usePendingResults({
    matches,
    matchReports,
    refreshMatches,
    setError,
    setUpdatingMatch,
  });

  const {
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
  } = useRoundLifecycle({
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
  });

  // ── Late entry ───────────────────────────────────────────────────────────────

  const handleAddLateEntry = async () => {
    if (!tournament || !user || !workspaceId || !lateEntryName.trim()) return;
    try {
      setAddingLateEntry(true);
      setError(null);

      const maxRound =
        matches.length > 0
          ? Math.max(...matches.map((m) => m.round_number))
          : 1;

      const currentRoundMatches = matches.filter(
        (m) => m.round_number === maxRound,
      );

      // Determine round state based on match statuses.
      // Initial tournament start creates byes as 'bye' immediately, but real matches
      // are 'ready' until Begin Round is pressed (which moves them to 'pending').
      // So "round has begun" = any real match is 'pending', or any non-bye match
      // has been completed. A lone 'bye' status match does NOT mean the round began.
      const roundHasBegun = currentRoundMatches.some(
        (m) =>
          m.status === MATCH_STATUS.PENDING ||
          (m.status === MATCH_STATUS.COMPLETED && m.player2_id !== null),
      );
      const roundComplete =
        currentRoundMatches.length > 0 &&
        currentRoundMatches.every(
          (m) =>
            m.status === MATCH_STATUS.COMPLETED ||
            m.status === MATCH_STATUS.BYE,
        );
      const preBeginRound =
        currentRoundMatches.length > 0 && !roundHasBegun && !roundComplete;

      // Insert the late entry player
      const { data: newPlayer, error: playerError } = await supabase
        .from("tournament_players")
        .insert({
          name: lateEntryName.trim(),
          tournament_id: tournament.id,
          created_by: user.id,
          workspace_id: workspaceId,
          is_late_entry: true,
          late_entry_round: maxRound,
        })
        .select("id, name")
        .single();

      if (playerError) throw new Error(playerError.message);

      // Create a loss record for every completed round the player missed.
      // Rounds 1..(maxRound-1) are always complete; maxRound is complete only
      // when roundComplete is true.
      if (newPlayer) {
        const missedRounds = roundComplete ? maxRound : maxRound - 1;
        if (missedRounds > 0) {
          const lossMatches = Array.from({ length: missedRounds }, (_, i) => ({
            tournament_id: tournament.id,
            workspace_id: workspaceId,
            round_number: i + 1,
            match_number: null,
            player1_id: newPlayer.id,
            player2_id: null,
            status: MATCH_STATUS.COMPLETED,
            result: "loss",
            winner_id: null,
          }));
          const { error: lossError } = await supabase
            .from("tournament_matches")
            .insert(lossMatches);
          if (lossError) throw new Error(lossError.message);
        }
      }

      if (preBeginRound && newPlayer) {
        // Round not yet begun: slot the new player into the existing bye, or
        // create a new 'ready' bye for them. All other pairings are untouched.
        // A bye can be 'ready' (from regenerate) or 'bye' (from initial start).
        const existingBye = currentRoundMatches.find((m) => !m.player2_id);
        if (existingBye) {
          // Pair the waiting bye player with the new player; convert back to a real match
          const { error: updateError } = await supabase
            .from("tournament_matches")
            .update({
              player2_id: newPlayer.id,
              status: MATCH_STATUS.READY,
              result: null,
              winner_id: null,
            })
            .eq("id", existingBye.id);
          if (updateError) throw new Error(updateError.message);
        } else {
          // No existing bye: new player waits as the bye for this round
          const maxMatchNum = currentRoundMatches.reduce(
            (max, m) => Math.max(max, m.match_number ?? 0),
            0,
          );
          const { error: matchError } = await supabase
            .from("tournament_matches")
            .insert({
              tournament_id: tournament.id,
              workspace_id: workspaceId,
              round_number: maxRound,
              match_number: maxMatchNum + 1,
              player1_id: newPlayer.id,
              player2_id: null,
              status: MATCH_STATUS.READY,
              result: null,
              winner_id: null,
            });
          if (matchError) throw new Error(matchError.message);
        }
      } else if (roundHasBegun && !roundComplete && newPlayer) {
        // Round in progress: absorb an existing bye if one exists, otherwise
        // give the late entry their own bye.
        const existingBye = currentRoundMatches.find((m) => !m.player2_id);
        if (existingBye) {
          // Convert the bye into a real in-progress match
          const { error: updateError } = await supabase
            .from("tournament_matches")
            .update({
              player2_id: newPlayer.id,
              status: MATCH_STATUS.PENDING,
              result: null,
              winner_id: null,
            })
            .eq("id", existingBye.id);
          if (updateError) throw new Error(updateError.message);
        } else {
          const maxMatchNum = currentRoundMatches.reduce(
            (max, m) => Math.max(max, m.match_number ?? 0),
            0,
          );
          const { error: matchError } = await supabase
            .from("tournament_matches")
            .insert({
              tournament_id: tournament.id,
              workspace_id: workspaceId,
              round_number: maxRound,
              match_number: maxMatchNum + 1,
              player1_id: newPlayer.id,
              player2_id: null,
              status: MATCH_STATUS.BYE,
              result: "bye",
              winner_id: newPlayer.id,
            });
          if (matchError) throw new Error(matchError.message);
        }
      }
      // If roundComplete: player is simply added; they'll appear in next round's pairing

      setLateEntryName("");
      setLateEntryDialogOpen(false);
      await refreshMatches();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add late entry");
    } finally {
      setAddingLateEntry(false);
    }
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
      if (error)
        throw new Error(error.message || "Failed to update drop status");

      const { data: fresh } = await supabase
        .from("tournament_players")
        .select(
          "id, name, dropped, dropped_at_round, has_static_seating, static_seat_number, deck_pokemon1, deck_pokemon2",
        )
        .eq("tournament_id", tournament.id)
        .order("name");
      setPlayers((fresh as TournamentPlayer[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update drop status");
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
        .select(
          "id, name, dropped, dropped_at_round, has_static_seating, static_seat_number, deck_pokemon1, deck_pokemon2",
        )
        .eq("tournament_id", tournament.id)
        .order("name");
      setPlayers((fresh as TournamentPlayer[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update seating");
    } finally {
      setSavingSeat(null);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Round lifecycle handlers live in useRoundLifecycle

  if (authLoading || loading || matchesLoading) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <Skeleton variant="rounded" width={150} height={36} sx={{ mr: 2 }} />
          <Skeleton variant="text" width={280} height={44} />
        </Box>
        <Paper sx={{ overflow: "hidden" }}>
          <Box sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}>
            <Skeleton
              variant="rounded"
              width={320}
              height={40}
              sx={{ my: 1 }}
            />
          </Box>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableCell key={i}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton variant="text" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    );
  }

  if (error || !tournament) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(wPath(`/tournaments/${id ?? ""}`))}
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
      <Box display="flex" flexWrap="wrap" alignItems="center" gap={1} mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(wPath(`/tournaments/${tournament.id}`))}
        >
          Back
        </Button>
        <Typography
          variant="h5"
          component="h1"
          sx={{ flex: 1, minWidth: 0 }}
          noWrap
        >
          {tournament.name} — Matches
        </Typography>
        {tournament.status === "active" && (
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setLateEntryDialogOpen(true)}
            >
              Add Late Entry
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setDropDialogOpen(true)}
            >
              Manage Players
            </Button>
          </Box>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {seatWarnings.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          onClose={() => setSeatWarnings([])}
        >
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
            const finalRoundNum = tournament.num_rounds;
            const finalRoundMatches = finalRoundNum
              ? matches.filter(
                  (m) =>
                    m.round_number === finalRoundNum &&
                    !(
                      m.player2_id === null &&
                      m.result === "loss" &&
                      m.status === "completed"
                    ),
                )
              : [];
            const finalRoundComplete =
              finalRoundMatches.length > 0 &&
              finalRoundMatches.every(
                (m) => m.status === "completed" || m.status === "bye",
              );
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
                    if (value === "add") {
                      handleAddRound();
                      return;
                    }
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
                      (m) =>
                        m.round_number === roundNumber &&
                        !(
                          m.player2_id === null &&
                          m.result === "loss" &&
                          m.status === "completed"
                        ),
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
                            sx={{
                              color: "success.main",
                              ml: 0.5,
                              lineHeight: 1,
                            }}
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

                    const isLastRound = roundNumber === totalRounds;
                    const canDelete =
                      !hasMatches &&
                      isLastRound &&
                      tournament.status === "active";

                    return (
                      <Tab
                        key={roundNumber}
                        label={
                          <Box
                            display="flex"
                            alignItems="center"
                            onMouseEnter={() =>
                              canDelete && setHoveredRound(roundNumber)
                            }
                            onMouseLeave={() => setHoveredRound(null)}
                          >
                            {`Round ${roundNumber}`}
                            {indicator}
                            {canDelete && (
                              <CloseIcon
                                fontSize="inherit"
                                sx={{
                                  ml: 0.75,
                                  fontSize: 14,
                                  cursor: "pointer",
                                  opacity:
                                    hoveredRound === roundNumber ? 1 : 0.3,
                                  color:
                                    hoveredRound === roundNumber
                                      ? "error.main"
                                      : "text.secondary",
                                  transition: "opacity 0.15s, color 0.15s",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteRoundConfirmRound(roundNumber);
                                }}
                              />
                            )}
                          </Box>
                        }
                        value={roundNumber}
                        sx={
                          hasMatches
                            ? {}
                            : {
                                color: "text.secondary",
                                fontWeight: 500,
                                opacity: 0.5,
                              }
                        }
                      />
                    );
                  })}
                  {tournament.status === "active" &&
                    (tournament.num_rounds ?? 0) < 20 &&
                    !finalRoundComplete && (
                      <Tab
                        icon={<AddIcon fontSize="small" />}
                        value="add"
                        title="Add round"
                        sx={{ minWidth: 44, px: 1 }}
                      />
                    )}
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
                      return (
                        <Box>
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            flexWrap="wrap"
                            gap={1}
                            mb={2}
                          >
                            <Typography variant="h6">
                              Final Standings
                            </Typography>
                            <Button
                              size="small"
                              endIcon={<OpenInNewIcon />}
                              onClick={() =>
                                window.open(
                                  window.location.origin +
                                    wPath(
                                      `/tournaments/${tournament.id}/pairings`,
                                    ),
                                  "_blank",
                                )
                              }
                            >
                              View on pairings page
                            </Button>
                          </Box>
                          {finalStandings.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No standings available yet. Complete some matches
                              to see standings.
                            </Typography>
                          ) : (
                            <StandingsTable
                              standings={finalStandings}
                              droppedMap={droppedPlayersMap}
                              deckMap={
                                deckPlayersMap.size > 0
                                  ? deckPlayersMap
                                  : undefined
                              }
                            />
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
                    const isLateEntryLossRecord = (m: Match) =>
                      m.player2_id === null &&
                      m.result === "loss" &&
                      m.status === "completed";

                    const baseMatches =
                      typeof selectedRound === "number"
                        ? matches.filter(
                            (m) =>
                              m.round_number === selectedRound &&
                              !isLateEntryLossRecord(m),
                          )
                        : [];

                    // Check round state for button display
                    const roundMatchesForState =
                      typeof selectedRound === "number"
                        ? matches.filter(
                            (m) =>
                              m.round_number === selectedRound &&
                              !isLateEntryLossRecord(m),
                          )
                        : [];
                    const currentRoundPendingCount =
                      roundMatchesForState.filter((m) =>
                        pendingResults.has(m.id),
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
                    const allPairingsPublished =
                      hasReadyMatches &&
                      roundMatchesForState
                        .filter((m) => m.status === "ready")
                        .every((m) => m.pairings_published);
                    const showPrePublish =
                      hasReadyMatches &&
                      !hasPendingMatches &&
                      !allPairingsPublished;
                    const showBeginRound =
                      hasReadyMatches &&
                      !hasPendingMatches &&
                      allPairingsPublished;
                    const nextRoundNumber =
                      typeof selectedRound === "number" ? selectedRound + 1 : 0;
                    const nextRoundAlreadyExists = matches.some(
                      (m) => m.round_number === nextRoundNumber,
                    );
                    const isFinalRound =
                      tournament.num_rounds &&
                      selectedRound === tournament.num_rounds;
                    const canCompleteTournament =
                      isFinalRound && allCompletedInDB;

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
                      const rankedForNumbering = [...baseMatches].sort(
                        (a, b) => {
                          const aIsBye = a.player2_id === null;
                          const bIsBye = b.player2_id === null;
                          if (aIsBye && !bIsBye) return 1;
                          if (!aIsBye && bIsBye) return -1;
                          if (aIsBye && bIsBye) {
                            const aPts =
                              standingsByPlayerId.get(a.player1_id)
                                ?.matchPoints ?? 0;
                            const bPts =
                              standingsByPlayerId.get(b.player1_id)
                                ?.matchPoints ?? 0;
                            if (aPts !== bPts) return aPts - bPts;
                            return a.player1_id.localeCompare(b.player1_id);
                          }
                          const a1 =
                            standingsByPlayerId.get(a.player1_id)
                              ?.matchPoints ?? 0;
                          const a2 =
                            standingsByPlayerId.get(a.player2_id!)
                              ?.matchPoints ?? 0;
                          const b1 =
                            standingsByPlayerId.get(b.player1_id)
                              ?.matchPoints ?? 0;
                          const b2 =
                            standingsByPlayerId.get(b.player2_id!)
                              ?.matchPoints ?? 0;
                          const aTop = Math.max(a1, a2);
                          const bTop = Math.max(b1, b2);
                          if (aTop !== bTop) return bTop - aTop;
                          const aSum = a1 + a2;
                          const bSum = b1 + b2;
                          if (aSum !== bSum) return bSum - aSum;
                          return `${a.player1_id}-${a.player2_id}`.localeCompare(
                            `${b.player1_id}-${b.player2_id}`,
                          );
                        },
                      );
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
                          (standingsByPlayerId.get(a.player1_id)?.matchPoints ??
                            0) +
                          (a.player2_id
                            ? (standingsByPlayerId.get(a.player2_id)
                                ?.matchPoints ?? 0)
                            : 0);
                        const ptsB =
                          (standingsByPlayerId.get(b.player1_id)?.matchPoints ??
                            0) +
                          (b.player2_id
                            ? (standingsByPlayerId.get(b.player2_id)
                                ?.matchPoints ?? 0)
                            : 0);
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

                    const handleSort = (
                      column: "match" | "status" | "record",
                    ) => {
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
                            <Typography
                              variant="subtitle2"
                              gutterBottom
                              fontWeight={600}
                            >
                              Pairing notes — Round{" "}
                              {typeof selectedRound === "number"
                                ? selectedRound
                                : "N/A"}
                            </Typography>

                            {/* Bye */}
                            {decisionLog.byeReason &&
                              decisionLog.byePlayerName && (
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                  <strong>{decisionLog.byePlayerName}</strong>{" "}
                                  received a bye (free win) this round
                                  {decisionLog.byePlayerPoints !== undefined &&
                                    ` · ${decisionLog.byePlayerPoints} pts`}
                                  {" — "}
                                  {humanizeByeReason(decisionLog.byeReason)}
                                </Typography>
                              )}

                            {/* Score group adjustments (floats) */}
                            {(() => {
                              const visibleFloats = (
                                decisionLog.floatDetails ?? []
                              ).filter(
                                (d) =>
                                  !d.reason.startsWith("DISSOLVE:") &&
                                  !d.reason.includes("bye (last bracket"),
                              );
                              return visibleFloats.length > 0 ? (
                                <Box sx={{ mb: 1 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: "bold" }}
                                  >
                                    Score group adjustments:
                                  </Typography>
                                  <Box
                                    component="ul"
                                    sx={{ mt: 0.5, mb: 0, pl: 2 }}
                                  >
                                    {visibleFloats.map((detail) => (
                                      <li key={detail.playerId}>
                                        <Typography
                                          variant="body2"
                                          component="span"
                                        >
                                          <strong>{detail.playerName}</strong> (
                                          {detail.playerPoints} pts) —{" "}
                                          {humanizeFloatReason(detail.reason)}
                                        </Typography>
                                      </li>
                                    ))}
                                  </Box>
                                </Box>
                              ) : null;
                            })()}

                            {/* Table assignment adjustments */}
                            {decisionLog.seatConflicts &&
                              decisionLog.seatConflicts.length > 0 && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: "bold" }}
                                  >
                                    Table assignments adjusted:
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
                                          moved to table {sc.resolvedSeat} (was
                                          table {sc.movedPlayerOriginalSeat}) to
                                          avoid a table conflict with{" "}
                                          <strong>{sc.opponentName}</strong>
                                        </Typography>
                                      </li>
                                    ))}
                                  </Box>
                                </Box>
                              )}

                            {/* Rematches */}
                            {decisionLog.rematchCount > 0 && (
                              <Typography variant="body2" sx={{ mb: 0.5 }}>
                                ⚠ {decisionLog.rematchCount} rematch
                                {decisionLog.rematchCount !== 1
                                  ? "es"
                                  : ""}{" "}
                                this round — unavoidable given current standings
                              </Typography>
                            )}
                            {decisionLog.rematchCount === 0 && (
                              <Typography variant="body2" color="success.main">
                                ✓ No player faced the same opponent twice
                              </Typography>
                            )}

                            {/* Largest score gap — only show if non-zero */}
                            {decisionLog.maxFloatDistance > 0 && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 0.5, fontSize: "0.78rem" }}
                              >
                                Largest score gap between paired players:{" "}
                                {decisionLog.maxFloatDistance} pt
                                {decisionLog.maxFloatDistance !== 1 ? "s" : ""}
                              </Typography>
                            )}
                          </Alert>
                        )}
                        {(showPrePublish ||
                          showBeginRound ||
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
                                      disabled={
                                        !pairingEditsValid || savingPairings
                                      }
                                      onClick={handleSavePairingEdits}
                                    >
                                      Save Pairings
                                    </Button>
                                  </span>
                                </Tooltip>
                              </>
                            ) : (
                              <>
                                {/* Phase 1a: pairings ready, not yet published */}
                                {showPrePublish && (
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
                                      onClick={handlePublishPairings}
                                      disabled={processingRound}
                                    >
                                      Publish Pairings
                                    </Button>
                                  </>
                                )}
                                {/* Phase 1b: pairings published, round not yet started */}
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
                                      variant="outlined"
                                      startIcon={<OpenInNewIcon />}
                                      onClick={() =>
                                        window.open(
                                          tournament.is_public &&
                                            tournament.public_slug
                                            ? `/public/t/${tournament.public_slug}`
                                            : wPath(
                                                `/tournaments/${tournament.id}/pairings`,
                                              ),
                                          "_blank",
                                        )
                                      }
                                    >
                                      View Pairings
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
                                  <>
                                    <Button
                                      variant="outlined"
                                      startIcon={<OpenInNewIcon />}
                                      onClick={() =>
                                        window.open(
                                          tournament.is_public &&
                                            tournament.public_slug
                                            ? `/public/t/${tournament.public_slug}`
                                            : wPath(
                                                `/tournaments/${tournament.id}/pairings`,
                                              ),
                                          "_blank",
                                        )
                                      }
                                    >
                                      View Pairings
                                    </Button>
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
                                          disabled={
                                            !allResultsEntered || updatingMatch
                                          }
                                          onClick={() =>
                                            void savePendingResults()
                                          }
                                        >
                                          {updatingMatch
                                            ? "Saving…"
                                            : `Submit Results (${currentRoundPendingCount})`}
                                        </Button>
                                      </span>
                                    </Tooltip>
                                    {tournament.round_duration_minutes &&
                                      (tournament.current_round_started_at ||
                                        tournament.round_is_paused) && (
                                        <Box
                                          sx={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                          }}
                                        >
                                          <RoundTimer
                                            startedAt={
                                              tournament.current_round_started_at ??
                                              null
                                            }
                                            durationMinutes={
                                              tournament.round_duration_minutes
                                            }
                                            elapsedSeconds={
                                              tournament.round_elapsed_seconds ??
                                              0
                                            }
                                            isPaused={
                                              tournament.round_is_paused ??
                                              false
                                            }
                                            size="small"
                                          />
                                          <Tooltip
                                            title={
                                              tournament.round_is_paused
                                                ? "Resume timer"
                                                : "Pause timer"
                                            }
                                          >
                                            <IconButton
                                              size="small"
                                              onClick={() =>
                                                void (tournament.round_is_paused
                                                  ? handleResumeTimer()
                                                  : handlePauseTimer())
                                              }
                                            >
                                              {tournament.round_is_paused ? (
                                                <PlayArrowIcon
                                                  sx={{ fontSize: "1rem" }}
                                                />
                                              ) : (
                                                <PauseIcon
                                                  sx={{ fontSize: "1rem" }}
                                                />
                                              )}
                                            </IconButton>
                                          </Tooltip>
                                          <Tooltip title="Edit timer duration">
                                            <IconButton
                                              size="small"
                                              onClick={() =>
                                                setTimerEditorOpen((v) => !v)
                                              }
                                            >
                                              <EditIcon
                                                sx={{ fontSize: "1rem" }}
                                              />
                                            </IconButton>
                                          </Tooltip>
                                        </Box>
                                      )}
                                    {!tournament.round_duration_minutes && (
                                      <Tooltip title="Add round timer">
                                        <IconButton
                                          size="small"
                                          onClick={() => {
                                            void handleSetRoundDuration(50);
                                            setTimerEditorOpen(true);
                                          }}
                                          disabled={savingTimer}
                                        >
                                          <AccessTimeIcon
                                            sx={{ fontSize: "1rem" }}
                                          />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </>
                                )}
                                {/* Phase 3: round complete — keep View Pairings visible */}
                                {allCompletedInDB && (
                                  <Button
                                    variant="outlined"
                                    startIcon={<OpenInNewIcon />}
                                    onClick={() =>
                                      window.open(
                                        tournament.is_public &&
                                          tournament.public_slug
                                          ? `/public/t/${tournament.public_slug}`
                                          : wPath(
                                              `/tournaments/${tournament.id}/pairings`,
                                            ),
                                        "_blank",
                                      )
                                    }
                                  >
                                    View Pairings
                                  </Button>
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
                                  (nextRoundAlreadyExists ||
                                    canProceedToNextRound) && (
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
                        {timerEditorOpen && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flexWrap: "wrap",
                              mt: 1,
                              mb: 1,
                            }}
                          >
                            <Switch
                              checked={!!tournament.round_duration_minutes}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  void handleSetRoundDuration(50);
                                } else {
                                  void handleSetRoundDuration(null);
                                }
                              }}
                              disabled={savingTimer}
                              size="small"
                            />
                            <Typography variant="body2" color="text.secondary">
                              Round timer
                            </Typography>
                            {!!tournament.round_duration_minutes && (
                              <>
                                <TextField
                                  type="number"
                                  size="small"
                                  label="Duration (minutes)"
                                  value={
                                    timerDurationInput ??
                                    tournament.round_duration_minutes.toString()
                                  }
                                  onChange={(e) =>
                                    setTimerDurationInput(e.target.value)
                                  }
                                  onBlur={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setTimerDurationInput(null);
                                    if (
                                      !isNaN(v) &&
                                      v >= 1 &&
                                      v <= 180 &&
                                      v !== tournament.round_duration_minutes
                                    ) {
                                      void handleSetRoundDuration(v);
                                    }
                                  }}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  inputProps={{ min: 1, max: 180, step: 1 }}
                                  sx={{ width: 160 }}
                                  disabled={savingTimer}
                                />
                                {([-10, -1, 1, 10] as const).map((delta) => {
                                  const next =
                                    (tournament.round_duration_minutes ?? 0) +
                                    delta;
                                  const disabled =
                                    savingTimer || next < 1 || next > 180;
                                  return (
                                    <Button
                                      key={delta}
                                      size="small"
                                      variant="outlined"
                                      disabled={disabled}
                                      onClick={() =>
                                        void handleSetRoundDuration(next)
                                      }
                                      sx={{ minWidth: 0, px: 1 }}
                                    >
                                      {delta > 0 ? `+${delta}m` : `${delta}m`}
                                    </Button>
                                  );
                                })}
                              </>
                            )}
                            <Tooltip title="Close">
                              <IconButton
                                size="small"
                                onClick={() => setTimerEditorOpen(false)}
                              >
                                <CloseIcon sx={{ fontSize: "1rem" }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                        {hasPendingMatches && !allCompletedInDB && (
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Add a note for players… (e.g. timer paused for judge call)"
                            value={roundNoteInput}
                            onChange={(e) => setRoundNoteInput(e.target.value)}
                            onFocus={() => {
                              noteInputFocusedRef.current = true;
                            }}
                            onBlur={() => {
                              noteInputFocusedRef.current = false;
                              void handleSaveRoundNote(roundNoteInput);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            inputProps={{ maxLength: 280 }}
                            sx={{ mt: 1, mb: 0.5 }}
                          />
                        )}
                        {/* Conflict notification */}
                        {!editingPairings &&
                          (() => {
                            const conflictMatches = roundMatches.filter(
                              (m) =>
                                matchReports.get(m.id)?.conflict_status ===
                                "conflict",
                            );
                            if (!conflictMatches.length) return null;
                            return (
                              <Alert severity="error" sx={{ mb: 1 }}>
                                {conflictMatches.length === 1
                                  ? "1 match has a player conflict — check the match below and resolve manually."
                                  : `${conflictMatches.length} matches have player conflicts — check them below and resolve manually.`}
                              </Alert>
                            );
                          })()}
                        {editingPairings && (
                          <Alert
                            severity={
                              availablePool.size > 0 ? "warning" : "info"
                            }
                            sx={{ mb: 1 }}
                          >
                            {availablePool.size > 0 ? (
                              <>
                                <strong>
                                  {[...availablePool.values()].join(
                                    availablePool.size === 2 ? " and " : ", ",
                                  )}
                                </strong>{" "}
                                {availablePool.size === 1 ? "needs" : "need"} to
                                be assigned to a match before you can save.
                              </>
                            ) : (
                              "Remove a player from their slot to add them to the pool, then assign them to an empty slot in another match."
                            )}
                          </Alert>
                        )}
                        {/* ── Mobile card view ────────────────────── */}
                        {isMobile && (
                          <Box
                            sx={{ display: "flex", flexDirection: "column" }}
                          >
                            {roundMatches.map((match) => {
                              const canEditCard =
                                match.status === "pending" &&
                                match.player2_id !== null;
                              const matchNumCard =
                                matchNumberById.get(match.id) ?? 0;
                              const pendingResultCard = pendingResults.get(
                                match.id,
                              );
                              let effWinnerId = pendingResultCard
                                ? pendingResultCard.winnerId
                                : match.winner_id;
                              let effResult = pendingResultCard
                                ? pendingResultCard.result
                                : match.result;
                              if (
                                !pendingResultCard &&
                                match.status !== "completed"
                              ) {
                                const reportCard = matchReports.get(match.id);
                                if (
                                  reportCard &&
                                  reportCard.conflict_status !== "conflict"
                                ) {
                                  const reportingOutcome =
                                    reportCard.player1_report ??
                                    reportCard.player2_report;
                                  const reportingPlayerId =
                                    reportCard.player1_report
                                      ? reportCard.player1_id
                                      : reportCard.player2_id;
                                  if (reportingOutcome === "draw") {
                                    effResult = "Draw";
                                  } else if (reportingOutcome === "win") {
                                    effWinnerId = reportingPlayerId;
                                    effResult =
                                      reportingPlayerId ===
                                      reportCard.player1_id
                                        ? "1-0"
                                        : "0-1";
                                  } else if (reportingOutcome === "loss") {
                                    effWinnerId =
                                      reportingPlayerId ===
                                      reportCard.player1_id
                                        ? match.player2_id
                                        : reportCard.player1_id;
                                    effResult =
                                      reportingPlayerId ===
                                      reportCard.player1_id
                                        ? "0-1"
                                        : "1-0";
                                  }
                                }
                              }
                              const isByeCard =
                                match.status === "bye" || !match.player2_id;
                              const p1Wins = effWinnerId === match.player1_id;
                              const p2Wins = effWinnerId === match.player2_id;
                              const isDrawCard = effResult === "Draw";
                              const cardP1Bg = isByeCard
                                ? "rgba(33,150,243,0.1)"
                                : isDrawCard
                                  ? "rgba(255,152,0,0.1)"
                                  : p1Wins
                                    ? "rgba(76,175,80,0.1)"
                                    : p2Wins
                                      ? "rgba(244,67,54,0.1)"
                                      : "transparent";
                              const cardP2Bg = isByeCard
                                ? "rgba(33,150,243,0.1)"
                                : isDrawCard
                                  ? "rgba(255,152,0,0.1)"
                                  : p2Wins
                                    ? "rgba(76,175,80,0.1)"
                                    : p1Wins
                                      ? "rgba(244,67,54,0.1)"
                                      : "transparent";
                              const p1SeatCard = playerStaticSeatMap.get(
                                match.player1_id,
                              );
                              const p2SeatCard = match.player2_id
                                ? playerStaticSeatMap.get(match.player2_id)
                                : undefined;
                              const hasStaticSeatCard =
                                p1SeatCard?.hasStaticSeating ||
                                p2SeatCard?.hasStaticSeating;
                              const getCardRecord = (pid: string) => {
                                const s = standingsByPlayerId.get(pid);
                                return `${s?.wins ?? 0}-${s?.losses ?? 0}-${s?.draws ?? 0} · ${s?.matchPoints ?? 0}pts`;
                              };
                              const isEditableMatch =
                                editingPairings &&
                                (match.status === MATCH_STATUS.READY ||
                                  match.status === MATCH_STATUS.BYE);
                              const ep = editedPairings.get(match.id);
                              const p1EditId = ep?.player1Id ?? null;
                              const p2EditId = ep?.player2Id ?? null;
                              const p1EditName = p1EditId
                                ? (roundPlayers.find((p) => p.id === p1EditId)
                                    ?.name ?? "Unknown")
                                : null;
                              const p2EditName = p2EditId
                                ? (roundPlayers.find((p) => p.id === p2EditId)
                                    ?.name ?? "Unknown")
                                : null;
                              return (
                                <Box
                                  key={match.id}
                                  sx={{
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    py: 1.5,
                                    px: 1,
                                  }}
                                >
                                  <Box
                                    display="flex"
                                    justifyContent="space-between"
                                    alignItems="center"
                                    mb={1}
                                  >
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      gap={0.5}
                                    >
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        fontWeight="medium"
                                      >
                                        Match {matchNumCard}
                                      </Typography>
                                      {hasStaticSeatCard && (
                                        <Tooltip title="Static seating">
                                          <PushPinIcon
                                            sx={{
                                              fontSize: 12,
                                              color: "text.secondary",
                                              opacity: 0.7,
                                            }}
                                          />
                                        </Tooltip>
                                      )}
                                    </Box>
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
                                  </Box>
                                  <Box
                                    display="flex"
                                    gap={1}
                                    mb={
                                      canEditCard &&
                                      !isByeCard &&
                                      !editingPairings
                                        ? 1
                                        : 0
                                    }
                                  >
                                    <Box
                                      sx={{
                                        flex: 1,
                                        p: 0.75,
                                        borderRadius: 1,
                                        backgroundColor: isEditableMatch
                                          ? "transparent"
                                          : cardP1Bg,
                                        minWidth: 0,
                                      }}
                                    >
                                      {isEditableMatch ? (
                                        p1EditId ? (
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            gap={0.5}
                                          >
                                            <Typography
                                              variant="body2"
                                              noWrap
                                              sx={{ flex: 1 }}
                                            >
                                              {p1EditName}
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
                                            sx={{ width: "100%" }}
                                          >
                                            {[...availablePool.entries()].map(
                                              ([id, name]) => (
                                                <MenuItem key={id} value={id}>
                                                  {name}
                                                </MenuItem>
                                              ),
                                            )}
                                          </Select>
                                        )
                                      ) : (
                                        <>
                                          <Typography
                                            variant="body2"
                                            fontWeight="medium"
                                            noWrap
                                          >
                                            {match.player1_name}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            {getCardRecord(match.player1_id)}
                                          </Typography>
                                        </>
                                      )}
                                    </Box>
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                      >
                                        vs
                                      </Typography>
                                    </Box>
                                    <Box
                                      sx={{
                                        flex: 1,
                                        p: 0.75,
                                        borderRadius: 1,
                                        backgroundColor: isEditableMatch
                                          ? "transparent"
                                          : cardP2Bg,
                                        minWidth: 0,
                                      }}
                                    >
                                      {isEditableMatch ? (
                                        p2EditId ? (
                                          <Box
                                            display="flex"
                                            alignItems="center"
                                            gap={0.5}
                                          >
                                            <Typography
                                              variant="body2"
                                              noWrap
                                              sx={{ flex: 1 }}
                                            >
                                              {p2EditName}
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
                                              <em>Select player…</em>
                                            )}
                                            sx={{ width: "100%" }}
                                          >
                                            {[...availablePool.entries()].map(
                                              ([id, name]) => (
                                                <MenuItem key={id} value={id}>
                                                  {name}
                                                </MenuItem>
                                              ),
                                            )}
                                          </Select>
                                        )
                                      ) : match.player2_name ? (
                                        <>
                                          <Typography
                                            variant="body2"
                                            fontWeight="medium"
                                            noWrap
                                          >
                                            {match.player2_name}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            {match.player2_id
                                              ? getCardRecord(match.player2_id)
                                              : ""}
                                          </Typography>
                                        </>
                                      ) : (
                                        <Typography
                                          variant="body2"
                                          color="info.main"
                                          fontStyle="italic"
                                        >
                                          BYE
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                  {canEditCard &&
                                    match.player2_id &&
                                    !editingPairings && (
                                      <Box display="flex" gap={0.5}>
                                        <Chip
                                          label="1-0"
                                          size="small"
                                          variant={
                                            p1Wins ? "filled" : "outlined"
                                          }
                                          sx={{
                                            flex: 1,
                                            borderColor: "success.main",
                                            color: p1Wins
                                              ? "white"
                                              : "success.main",
                                            backgroundColor: p1Wins
                                              ? "success.main"
                                              : "transparent",
                                            cursor: "pointer",
                                            "&:hover": {
                                              backgroundColor: p1Wins
                                                ? "success.dark"
                                                : "success.light",
                                              color: "white",
                                            },
                                          }}
                                          onClick={() =>
                                            handleQuickResult(match, "player1")
                                          }
                                          disabled={!!updatingMatch}
                                        />
                                        <Chip
                                          label="Draw"
                                          size="small"
                                          variant={
                                            isDrawCard ? "filled" : "outlined"
                                          }
                                          sx={{
                                            flex: 1,
                                            borderColor: "warning.main",
                                            color: isDrawCard
                                              ? "white"
                                              : "warning.main",
                                            backgroundColor: isDrawCard
                                              ? "warning.main"
                                              : "transparent",
                                            cursor: "pointer",
                                            "&:hover": {
                                              backgroundColor: isDrawCard
                                                ? "warning.dark"
                                                : "warning.light",
                                              color: "white",
                                            },
                                          }}
                                          onClick={() =>
                                            handleQuickResult(match, "draw")
                                          }
                                          disabled={!!updatingMatch}
                                        />
                                        <Chip
                                          label="0-1"
                                          size="small"
                                          variant={
                                            p2Wins ? "filled" : "outlined"
                                          }
                                          sx={{
                                            flex: 1,
                                            borderColor: "error.main",
                                            color: p2Wins
                                              ? "white"
                                              : "error.main",
                                            backgroundColor: p2Wins
                                              ? "error.main"
                                              : "transparent",
                                            cursor: "pointer",
                                            "&:hover": {
                                              backgroundColor: p2Wins
                                                ? "error.dark"
                                                : "error.light",
                                              color: "white",
                                            },
                                          }}
                                          onClick={() =>
                                            handleQuickResult(match, "player2")
                                          }
                                          disabled={!!updatingMatch}
                                        />
                                      </Box>
                                    )}
                                  {/* Player-submitted result indicator (mobile) */}
                                  {matchReports.has(match.id) &&
                                    (() => {
                                      const report = matchReports.get(
                                        match.id,
                                      )!;
                                      if (
                                        report.conflict_status === "conflict"
                                      ) {
                                        const p1out =
                                          report.player1_report ?? "?";
                                        const p2out =
                                          report.player2_report ?? "?";
                                        return (
                                          <Chip
                                            icon={<WarningAmberIcon />}
                                            label={`Conflict: ${report.player1_name} ${p1out} / ${report.player2_name ?? "P2"} ${p2out}`}
                                            color="error"
                                            size="small"
                                            sx={{ alignSelf: "flex-start" }}
                                          />
                                        );
                                      }
                                      // partial — result already applied, just indicate source
                                      return (
                                        <Chip
                                          icon={<PersonIcon />}
                                          label="Player reported"
                                          color="info"
                                          size="small"
                                          variant="outlined"
                                          sx={{ alignSelf: "flex-start" }}
                                        />
                                      );
                                    })()}
                                </Box>
                              );
                            })}
                          </Box>
                        )}
                        {/* ── Desktop table ────────────────────────── */}
                        <TableContainer
                          sx={{
                            overflowX: "auto",
                            display: { xs: "none", sm: "block" },
                          }}
                        >
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
                                let effectiveWinnerId = pendingResult
                                  ? pendingResult.winnerId
                                  : match.winner_id;
                                let effectiveResult = pendingResult
                                  ? pendingResult.result
                                  : match.result;
                                if (
                                  !pendingResult &&
                                  match.status !== "completed"
                                ) {
                                  const report = matchReports.get(match.id);
                                  if (
                                    report &&
                                    report.conflict_status !== "conflict"
                                  ) {
                                    const reportingOutcome =
                                      report.player1_report ??
                                      report.player2_report;
                                    const reportingPlayerId =
                                      report.player1_report
                                        ? report.player1_id
                                        : report.player2_id;
                                    if (reportingOutcome === "draw") {
                                      effectiveResult = "Draw";
                                    } else if (reportingOutcome === "win") {
                                      effectiveWinnerId = reportingPlayerId;
                                      effectiveResult =
                                        reportingPlayerId === report.player1_id
                                          ? "1-0"
                                          : "0-1";
                                    } else if (reportingOutcome === "loss") {
                                      effectiveWinnerId =
                                        reportingPlayerId === report.player1_id
                                          ? match.player2_id
                                          : report.player1_id;
                                      effectiveResult =
                                        reportingPlayerId === report.player1_id
                                          ? "0-1"
                                          : "1-0";
                                    }
                                  }
                                }

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

                                const p1Seat = playerStaticSeatMap.get(
                                  match.player1_id,
                                );
                                const p2Seat = match.player2_id
                                  ? playerStaticSeatMap.get(match.player2_id)
                                  : undefined;
                                const hasStaticSeating =
                                  p1Seat?.hasStaticSeating ||
                                  p2Seat?.hasStaticSeating;

                                return (
                                  <TableRow key={match.id}>
                                    <TableCell>
                                      <Box
                                        display="flex"
                                        alignItems="center"
                                        gap={0.5}
                                      >
                                        {matchNumber}
                                        {hasStaticSeating && (
                                          <Tooltip title="Static seating">
                                            <PushPinIcon
                                              sx={{
                                                fontSize: 13,
                                                color: "text.secondary",
                                                opacity: 0.7,
                                              }}
                                            />
                                          </Tooltip>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        backgroundColor:
                                          editingPairings &&
                                          (match.status ===
                                            MATCH_STATUS.READY ||
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
                                              {[...availablePool.entries()].map(
                                                ([id, name]) => (
                                                  <MenuItem key={id} value={id}>
                                                    {name}
                                                  </MenuItem>
                                                ),
                                              )}
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
                                                const s =
                                                  standingsByPlayerId.get(
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
                                                  handleQuickResult(
                                                    match,
                                                    "draw",
                                                  )
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
                                          (match.status ===
                                            MATCH_STATUS.READY ||
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
                                              {[...availablePool.entries()].map(
                                                ([id, name]) => (
                                                  <MenuItem key={id} value={id}>
                                                    {name}
                                                  </MenuItem>
                                                ),
                                              )}
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
                                      <Box
                                        display="flex"
                                        flexDirection="column"
                                        gap={0.5}
                                        alignItems="flex-start"
                                      >
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
                                        {/* Player-submitted result indicator */}
                                        {matchReports.has(match.id) &&
                                          (() => {
                                            const report = matchReports.get(
                                              match.id,
                                            )!;
                                            if (
                                              report.conflict_status ===
                                              "conflict"
                                            ) {
                                              const p1out =
                                                report.player1_report ?? "?";
                                              const p2out =
                                                report.player2_report ?? "?";
                                              return (
                                                <Chip
                                                  icon={<WarningAmberIcon />}
                                                  label={`Conflict: ${report.player1_name} ${p1out} / ${report.player2_name ?? "P2"} ${p2out}`}
                                                  color="error"
                                                  size="small"
                                                  sx={{
                                                    fontSize: "0.65rem",
                                                    height: 22,
                                                  }}
                                                />
                                              );
                                            }
                                            // partial — result already applied, just indicate source
                                            return (
                                              <Chip
                                                icon={<PersonIcon />}
                                                label="Player reported"
                                                color="info"
                                                size="small"
                                                variant="outlined"
                                                sx={{
                                                  fontSize: "0.65rem",
                                                  height: 22,
                                                }}
                                              />
                                            );
                                          })()}
                                      </Box>
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
                        {tournament.status === "active" &&
                          typeof selectedRound === "number" &&
                          selectedRound === tournament.num_rounds &&
                          selectedRound > 1 && (
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              startIcon={<CloseIcon fontSize="small" />}
                              onClick={() =>
                                setDeleteRoundConfirmRound(selectedRound)
                              }
                            >
                              Remove this round
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
                            Math.min(
                              2,
                              Math.max(0, parseInt(e.target.value, 10) || 0),
                            ),
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
                            Math.min(
                              2,
                              Math.max(0, parseInt(e.target.value, 10) || 0),
                            ),
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
            Dropped players keep their record but are excluded from future
            pairings. Static seating keeps a player at a fixed table each round.
          </Typography>
          {players.map((player, idx) => {
            const standing = finalStandingsById.get(player.id);
            const isSaving = savingSeat === player.id;
            return (
              <Box
                key={player.id}
                py={1.5}
                sx={{
                  borderBottom: idx < players.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  opacity: player.dropped ? 0.65 : 1,
                }}
              >
                {/* Top row: name + record + drop button */}
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body1">{player.name}</Typography>
                      {player.is_late_entry && (
                        <Chip
                          label="Late Entry"
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                      )}
                    </Box>
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
                      value={
                        seatInputs.has(player.id)
                          ? seatInputs.get(player.id)!
                          : (player.static_seat_number?.toString() ?? "")
                      }
                      onChange={(e) => {
                        setSeatInputs((prev) =>
                          new Map(prev).set(player.id, e.target.value),
                        );
                      }}
                      onBlur={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        const val =
                          e.target.value === "" || isNaN(parsed)
                            ? null
                            : parsed;
                        setSeatInputs((prev) => {
                          const next = new Map(prev);
                          next.delete(player.id);
                          return next;
                        });
                        if (val !== player.static_seat_number) {
                          handleUpdateStaticSeat(player.id, true, val);
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      inputProps={{ min: 1, style: { width: 60 } }}
                      sx={{ width: 90 }}
                    />
                  )}
                  {isSaving && (
                    <Typography variant="caption" color="text.secondary">
                      Saving…
                    </Typography>
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

      {/* Late entry dialog */}
      {(() => {
        const maxRound =
          matches.length > 0
            ? Math.max(...matches.map((m) => m.round_number))
            : 1;
        const currentRoundMs = matches.filter(
          (m) => m.round_number === maxRound,
        );
        const roundHasBegun = currentRoundMs.some(
          (m) =>
            m.status === MATCH_STATUS.PENDING ||
            (m.status === MATCH_STATUS.COMPLETED && m.player2_id !== null),
        );
        const roundComplete =
          currentRoundMs.length > 0 &&
          currentRoundMs.every(
            (m) =>
              m.status === MATCH_STATUS.COMPLETED ||
              m.status === MATCH_STATUS.BYE,
          );
        const preBeginRound =
          currentRoundMs.length > 0 && !roundHasBegun && !roundComplete;
        const existingByeInRound = !roundComplete
          ? currentRoundMs.find((m) => !m.player2_id)
          : null;

        let infoMessage: string;
        if (preBeginRound) {
          if (existingByeInRound) {
            infoMessage = `Round ${maxRound} hasn't started yet. The player will be paired with ${existingByeInRound.player1_name}, who currently has a bye.`;
          } else {
            infoMessage = `Round ${maxRound} hasn't started yet. The player will be added as the bye for this round and enter the bracket from round ${maxRound + 1} onward.`;
          }
        } else if (roundHasBegun && !roundComplete) {
          if (existingByeInRound) {
            infoMessage = `Round ${maxRound} is in progress. The player will be paired with ${existingByeInRound.player1_name}, who currently has a bye.`;
          } else {
            infoMessage = `Round ${maxRound} is in progress. This player will receive a bye for round ${maxRound} and enter the bracket from round ${maxRound + 1} onward.`;
          }
        } else {
          infoMessage = `This player will join with 0 points and be included in the next round's pairings.`;
        }

        return (
          <>
            <Dialog
              open={lateEntryDialogOpen}
              onClose={() => {
                setLateEntryDialogOpen(false);
                setLateEntryName("");
              }}
              maxWidth="sm"
              fullWidth
            >
              <DialogTitle>Add Late Entry</DialogTitle>
              <DialogContent>
                <Alert severity="info" sx={{ mb: 2 }}>
                  {infoMessage}
                </Alert>
                <TextField
                  autoFocus
                  fullWidth
                  label="Player Name"
                  value={lateEntryName}
                  onChange={(e) => setLateEntryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && lateEntryName.trim()) {
                      void handleAddLateEntry();
                    }
                  }}
                />
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setLateEntryDialogOpen(false);
                    setLateEntryName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={() => void handleAddLateEntry()}
                  disabled={!lateEntryName.trim() || addingLateEntry}
                >
                  {addingLateEntry ? "Adding…" : "Add Player"}
                </Button>
              </DialogActions>
            </Dialog>

            {/* Delete round confirmation */}
            <Dialog
              open={deleteRoundConfirmRound !== null}
              onClose={() => setDeleteRoundConfirmRound(null)}
            >
              <DialogTitle>Remove Round {deleteRoundConfirmRound}?</DialogTitle>
              <DialogContent>
                <Typography>
                  This will permanently remove Round {deleteRoundConfirmRound}{" "}
                  from the tournament. The tournament will end after Round{" "}
                  {(deleteRoundConfirmRound ?? 1) - 1}.
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setDeleteRoundConfirmRound(null)}>
                  Cancel
                </Button>
                <Button
                  color="error"
                  variant="contained"
                  onClick={() => {
                    if (deleteRoundConfirmRound !== null) {
                      handleDeleteRound(deleteRoundConfirmRound);
                      setDeleteRoundConfirmRound(null);
                    }
                  }}
                >
                  Remove Round
                </Button>
              </DialogActions>
            </Dialog>
          </>
        );
      })()}
      <Snackbar
        open={autoSaveWarning}
        autoHideDuration={5000}
        onClose={() => setAutoSaveWarning(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setAutoSaveWarning(false)}>
          Auto-save failed — your result may not persist if you navigate away.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TournamentMatches;
