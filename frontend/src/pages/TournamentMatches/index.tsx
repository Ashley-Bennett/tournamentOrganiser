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
  Skeleton,
  Snackbar,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthContext";
import { useWorkspace } from "../../WorkspaceContext";
import { calculateMatchPoints } from "../../utils/tournamentPairing";
import { sortByTieBreakers } from "../../utils/tieBreaking";
import { buildStandingsFromMatches } from "../../utils/tournamentUtils";
import { TournamentSummary } from "../../types/tournament";
import { usePairingEditor } from "../../hooks/usePairingEditor";
import { usePendingResults } from "../../hooks/usePendingResults";
import { useMatchReports } from "../../hooks/useMatchReports";
import { useMatchData } from "../../hooks/useMatchData";
import { useRoundLifecycle } from "../../hooks/useRoundLifecycle";
import {
  type TournamentPlayer,
  type Match,
  type MatchWithPlayers,
  MATCH_STATUS,
} from "../../types/match";
import StandingsTable from "../../components/StandingsTable";
import ErrorBoundary from "../../components/ErrorBoundary";
import ScoreDialog from "./ScoreDialog";
import DeleteRoundDialog from "./DeleteRoundDialog";
import LateEntryDialog from "./LateEntryDialog";
import RoundNoteField from "./RoundNoteField";
import PairingDecisionAlert from "./PairingDecisionAlert";
import TimerEditor from "./TimerEditor";
import MatchCardMobile from "./MatchCardMobile";
import MatchTableDesktop from "./MatchTableDesktop";
import PlayerManagementDialog from "./PlayerManagementDialog";
import RoundTabs from "./RoundTabs";
import RoundActionBar from "./RoundActionBar";

const TournamentMatches: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { workspaceId, wPath } = useWorkspace();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const initialTournamentLoadDoneRef = useRef(false);
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
  const [savingTimer, setSavingTimer] = useState(false);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);

  const makeRetryable = (fn: () => void): (() => void) => () => {
    setRetryAction(() => fn);
    fn();
  };
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
      const isInitialLoad = !initialTournamentLoadDoneRef.current;
      try {
        if (isInitialLoad) setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note",
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
              "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note",
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
        initialTournamentLoadDoneRef.current = true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load tournament");
        setTournament(null);
      } finally {
        if (isInitialLoad) setLoading(false);
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

  if (!tournament) {
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
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            retryAction ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const fn = retryAction;
                  setRetryAction(null);
                  fn();
                }}
              >
                Retry
              </Button>
            ) : undefined
          }
        >
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
          <Typography variant="body2" color="text.secondary" mb={2}>
            Start the tournament and generate round 1 pairings to see matches here.
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate(wPath(`/tournaments/${id}`))}
          >
            Go to tournament setup
          </Button>
        </Paper>
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          {((): ReactNode => {
            return (
              <>
                <RoundTabs
                  selectedRound={selectedRound}
                  matches={matches}
                  pendingResults={pendingResults}
                  tournament={tournament}
                  hoveredRound={hoveredRound}
                  setHoveredRound={setHoveredRound}
                  onSelectRound={setSelectedRound}
                  onAddRound={handleAddRound}
                  onRequestDeleteRound={setDeleteRoundConfirmRound}
                />
                <ErrorBoundary section="matches">
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
                        <PairingDecisionAlert
                          decisionLog={decisionLog}
                          selectedRound={selectedRound}
                        />
                        <RoundActionBar
                          showPrePublish={showPrePublish}
                          showBeginRound={showBeginRound}
                          hasPendingMatches={hasPendingMatches}
                          allCompletedInDB={allCompletedInDB}
                          canShowNextRound={!!canShowNextRound}
                          canProceedToNextRound={!!canProceedToNextRound}
                          canCompleteTournament={!!canCompleteTournament}
                          editingPairings={editingPairings}
                          savingPairings={savingPairings}
                          pairingEditsValid={pairingEditsValid}
                          availablePool={availablePool}
                          processingRound={processingRound}
                          updatingMatch={updatingMatch}
                          allResultsEntered={allResultsEntered}
                          currentRoundPendingCount={currentRoundPendingCount}
                          nextRoundAlreadyExists={nextRoundAlreadyExists}
                          tournament={tournament}
                          savingTimer={savingTimer}
                          wPath={wPath}
                          onCancelEditPairings={handleCancelEditPairings}
                          onSavePairingEdits={makeRetryable(() => void handleSavePairingEdits())}
                          onEditPairings={handleEditPairings}
                          onPublishPairings={makeRetryable(() => void handlePublishPairings())}
                          onBeginRound={makeRetryable(() => void handleBeginRound())}
                          onSubmitResults={makeRetryable(() => void savePendingResults())}
                          onPauseTimer={() => void handlePauseTimer()}
                          onResumeTimer={() => void handleResumeTimer()}
                          onToggleTimerEditor={() => setTimerEditorOpen((v) => !v)}
                          onAddTimer={() => { void handleSetRoundDuration(50); setTimerEditorOpen(true); }}
                          onNextRound={makeRetryable(() => void handleNextRound())}
                          onCompleteTournament={makeRetryable(() => void handleCompleteTournament())}
                          onManagePlayers={() => setDropDialogOpen(true)}
                        />
                        {timerEditorOpen && (
                          <TimerEditor
                            durationMinutes={tournament.round_duration_minutes}
                            durationInput={timerDurationInput}
                            setDurationInput={setTimerDurationInput}
                            saving={savingTimer}
                            onSetDuration={(v) => void handleSetRoundDuration(v)}
                            onClose={() => setTimerEditorOpen(false)}
                          />
                        )}
                        {hasPendingMatches && !allCompletedInDB && (
                          <RoundNoteField
                            value={roundNoteInput}
                            onChange={setRoundNoteInput}
                            onFocus={() => { noteInputFocusedRef.current = true; }}
                            onBlur={(v) => {
                              noteInputFocusedRef.current = false;
                              void handleSaveRoundNote(v);
                            }}
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
                          <MatchCardMobile
                            matches={roundMatches}
                            pendingResults={pendingResults}
                            matchReports={matchReports}
                            matchNumberById={matchNumberById}
                            standingsByPlayerId={standingsByPlayerId}
                            playerStaticSeatMap={playerStaticSeatMap}
                            editingPairings={editingPairings}
                            editedPairings={editedPairings}
                            roundPlayers={roundPlayers}
                            availablePool={availablePool}
                            updatingMatch={updatingMatch}
                            handleQuickResult={handleQuickResult}
                            removeFromSlot={removeFromSlot}
                            assignToSlot={assignToSlot}
                          />
                        )}
                        {/* ── Desktop table ────────────────────────── */}
                        <MatchTableDesktop
                          matches={roundMatches}
                          pendingResults={pendingResults}
                          matchReports={matchReports}
                          matchNumberById={matchNumberById}
                          standingsByPlayerId={standingsByPlayerId}
                          playerStaticSeatMap={playerStaticSeatMap}
                          editingPairings={editingPairings}
                          editedPairings={editedPairings}
                          roundPlayers={roundPlayers}
                          availablePool={availablePool}
                          updatingMatch={updatingMatch}
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          handleSort={handleSort}
                          handleQuickResult={handleQuickResult}
                          removeFromSlot={removeFromSlot}
                          assignToSlot={assignToSlot}
                        />
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
                              onClick={makeRetryable(() => void handleRegenerateRound1())}
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
                </ErrorBoundary>
              </>
            );
          })()}
        </Paper>
      )}

      <ScoreDialog
        open={scoreDialogOpen}
        match={selectedMatch}
        selectedWinner={selectedWinner}
        setSelectedWinner={setSelectedWinner}
        player1Wins={player1Wins}
        setPlayer1Wins={setPlayer1Wins}
        player2Wins={player2Wins}
        setPlayer2Wins={setPlayer2Wins}
        updatingMatch={updatingMatch}
        getScoreValidationError={getScoreValidationError}
        onSave={handleSaveMatchResult}
        onClose={handleCloseScoreDialog}
        setError={setError}
      />

      <PlayerManagementDialog
        open={dropDialogOpen}
        players={players}
        finalStandingsById={finalStandingsById}
        togglingDrop={togglingDrop}
        savingSeat={savingSeat}
        onClose={() => setDropDialogOpen(false)}
        onToggleDrop={handleToggleDrop}
        onUpdateStaticSeat={handleUpdateStaticSeat}
      />

      <LateEntryDialog
        open={lateEntryDialogOpen}
        name={lateEntryName}
        setName={setLateEntryName}
        matches={matches}
        adding={addingLateEntry}
        onSubmit={handleAddLateEntry}
        onClose={() => {
          setLateEntryDialogOpen(false);
          setLateEntryName("");
        }}
      />
      <DeleteRoundDialog
        roundNumber={deleteRoundConfirmRound}
        onConfirm={handleDeleteRound}
        onClose={() => setDeleteRoundConfirmRound(null)}
      />
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


