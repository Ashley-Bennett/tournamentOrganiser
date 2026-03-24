import React, { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Typography,
  Button,
  Box,
  Paper,
  Chip,
  Alert,
  TextField,
  Checkbox,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Switch,
  FormControlLabel,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  InputAdornment,
} from "@mui/material";
import SeatIcon from "@mui/icons-material/EventSeat";
import { PlayArrow as PlayArrowIcon } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PeopleIcon from "@mui/icons-material/People";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import PageLoading from "../components/PageLoading";
import TournamentPageHeader from "../components/TournamentPageHeader";
import { useTournament } from "../hooks/useTournament";
import { useWorkspace } from "../WorkspaceContext";
import { useTournamentPlayers } from "../hooks/useTournamentPlayers";
import type { TournamentSummary, TournamentPlayer } from "../types/tournament";
import { formatDateTime } from "../utils/format";
import {
  getTournamentTypeLabel,
  calculateSuggestedRounds,
  assignMatchNumbers,
} from "../utils/tournamentUtils";
import { generateRound1Pairings } from "../utils/tournamentPairing";

// Isolated component so typing only re-renders this small subtree, not the whole page.
interface AddPlayerInputProps {
  onAdd: (name: string) => Promise<void>;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onBulkMode: () => void;
}

const AddPlayerInput: React.FC<AddPlayerInputProps> = ({ onAdd, disabled, inputRef, onBulkMode }) => {
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || disabled) return;
    await onAdd(trimmed);
    setName("");
    inputRef.current?.focus();
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => { void handleSubmit(e); }}
      display="flex"
      gap={2}
      mb={2}
      flexWrap="wrap"
      alignItems="flex-start"
    >
      <TextField
        label="Player name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        size="small"
        autoComplete="off"
        sx={{ minWidth: 240 }}
        inputRef={inputRef}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={disabled || !name.trim()}
      >
        Add Player
      </Button>
      <Button
        size="small"
        variant="outlined"
        onClick={onBulkMode}
        sx={{ alignSelf: "center" }}
      >
        Bulk add (multiple)
      </Button>
    </Box>
  );
};

const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNewTournament = !!(location.state as { new?: boolean } | null)?.new;
  const { user, loading: authLoading } = useAuth();
  const { workspaceId, wPath, currentRole } = useWorkspace();
  const isManager = currentRole === "owner" || currentRole === "admin";
  const { tournament, setTournament, loading, error, setError } = useTournament(
    id,
    user,
    authLoading,
    workspaceId,
  );
  const {
    players,
    setPlayers,
    loading: playersLoading,
    error: playersError,
    setError: setPlayersError,
    refetch: refetchPlayers,
  } = useTournamentPlayers(tournament?.id);

  const [addingPlayer, setAddingPlayer] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [addingBulk, setAddingBulk] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [confirmDeletePlayerId, setConfirmDeletePlayerId] = useState<
    string | null
  >(null);
  const [startingTournament, setStartingTournament] = useState(false);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [savingTimer, setSavingTimer] = useState(false);
  const [timerDurationInput, setTimerDurationInput] = useState<string | null>(null);
  const [numRounds, setNumRounds] = useState<number | null>(null);
  const [savingSeat, setSavingSeat] = useState<string | null>(null);
  const playerNameInputRef = useRef<HTMLInputElement>(null);

  // ── Claim links ──────────────────────────────────────────────────────────
  // claimTokens: player.id → token string (once generated)
  // claimIds:    player.id → claim row id (for revoke)
  // copiedId:    player.id currently showing "Copied!" tooltip
  const [claimTokens, setClaimTokens] = useState<Record<string, string>>({});
  const [claimIds, setClaimIds] = useState<Record<string, string>>({});
  const [generatingClaimId, setGeneratingClaimId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPlayerList, setCopiedPlayerList] = useState(false);

  // ── Self-registration toggle ─────────────────────────────────────────────
  const [copiedJoinLink, setCopiedJoinLink] = useState(false);

  const handleToggleJoinEnabled = async (enabled: boolean) => {
    if (!tournament || !workspaceId) return;
    setTournament({ ...tournament, join_enabled: enabled });
    const { error } = await supabase
      .from("tournaments")
      .update({ join_enabled: enabled })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    if (error) {
      setTournament({ ...tournament, join_enabled: !enabled });
      setError(error.message);
    }
  };

  // ── Inline name editing ───────────────────────────────────────────────────
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // ── Player list search/sort ───────────────────────────────────────────────
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSort, setPlayerSort] = useState<"name" | "joined">("joined");
  const [playerSortDir, setPlayerSortDir] = useState<"asc" | "desc">("asc");

  // ── Known Players dialog ─────────────────────────────────────────────────
  interface WorkspacePlayer {
    user_id: string;
    preferred_name: string | null;
    display_name: string | null;
  }
  const [knownPlayersOpen, setKnownPlayersOpen] = useState(false);
  const [knownPlayers, setKnownPlayers] = useState<WorkspacePlayer[]>([]);
  const [knownPlayersLoading, setKnownPlayersLoading] = useState(false);
  const [knownPlayersSearch, setKnownPlayersSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [addingKnown, setAddingKnown] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (tournament) {
      setNumRounds(tournament.num_rounds ?? 3);
    }
  }, [tournament]);

  const suggestedRounds = useMemo(
    () => (tournament ? calculateSuggestedRounds(players.length, tournament.tournament_type) : 0),
    [players.length, tournament],
  );

  const filteredPlayers = useMemo(() => {
    let list = [...players];
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (playerSort === "name") cmp = a.name.localeCompare(b.name);
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return playerSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [players, playerSearch, playerSort, playerSortDir]);

  // Fetch current round matches and update pairings to account for a newly added
  // late-entry player. Returns the current max round number.
  const applyLateEntryPairing = async (
    newPlayerId: string,
    currentMatches: Array<{
      id: string;
      round_number: number;
      player1_id: string;
      player2_id: string | null;
      status: string;
      match_number: number | null;
    }>,
    maxRound: number,
  ) => {
    const currentRoundMatches = currentMatches.filter(
      (m) => m.round_number === maxRound,
    );

    // "Round has begun" = Begin Round was pressed (real matches move to 'pending').
    // Initial byes created as 'bye' at tournament start do NOT count as begun.
    const roundHasBegun = currentRoundMatches.some(
      (m) =>
        m.status === "pending" ||
        (m.status === "completed" && m.player2_id !== null),
    );
    const roundComplete =
      currentRoundMatches.length > 0 &&
      currentRoundMatches.every(
        (m) => m.status === "completed" || m.status === "bye",
      );
    const preBeginRound =
      currentRoundMatches.length > 0 && !roundHasBegun && !roundComplete;

    const maxMatchNum = currentRoundMatches.reduce(
      (max, m) => Math.max(max, m.match_number ?? 0),
      0,
    );

    // Create a loss record for every completed round the player missed.
    // Rounds 1..(maxRound-1) are always complete; maxRound is complete only
    // when roundComplete is true.
    const missedRounds = roundComplete ? maxRound : maxRound - 1;
    if (missedRounds > 0) {
      const lossMatches = Array.from({ length: missedRounds }, (_, i) => ({
        tournament_id: tournament!.id,
        workspace_id: workspaceId,
        round_number: i + 1,
        match_number: null,
        player1_id: newPlayerId,
        player2_id: null,
        status: "completed",
        result: "loss",
        winner_id: null,
      }));
      const { error } = await supabase
        .from("tournament_matches")
        .insert(lossMatches);
      if (error) throw new Error(error.message);
    }

    if (preBeginRound) {
      // Find any existing bye (player2_id = null), regardless of 'ready'/'bye' status
      const existingBye = currentRoundMatches.find((m) => !m.player2_id);
      if (existingBye) {
        // Convert the bye into a real match with the new player
        const { error } = await supabase
          .from("tournament_matches")
          .update({
            player2_id: newPlayerId,
            status: "ready",
            result: null,
            winner_id: null,
          })
          .eq("id", existingBye.id);
        if (error) throw new Error(error.message);
      } else {
        // No existing bye: new player becomes the bye for this round
        const { error } = await supabase.from("tournament_matches").insert({
          tournament_id: tournament!.id,
          workspace_id: workspaceId,
          round_number: maxRound,
          match_number: maxMatchNum + 1,
          player1_id: newPlayerId,
          player2_id: null,
          status: "ready",
          result: null,
          winner_id: null,
        });
        if (error) throw new Error(error.message);
      }
    } else if (roundHasBegun && !roundComplete) {
      // Round in progress: absorb an existing bye if one exists, otherwise
      // give the late entry their own bye.
      const existingBye = currentRoundMatches.find((m) => !m.player2_id);
      if (existingBye) {
        // Convert the bye into a real in-progress match
        const { error } = await supabase
          .from("tournament_matches")
          .update({
            player2_id: newPlayerId,
            status: "pending",
            result: null,
            winner_id: null,
          })
          .eq("id", existingBye.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("tournament_matches").insert({
          tournament_id: tournament!.id,
          workspace_id: workspaceId,
          round_number: maxRound,
          match_number: maxMatchNum + 1,
          player1_id: newPlayerId,
          player2_id: null,
          status: "bye",
          result: "bye",
          winner_id: newPlayerId,
        });
        if (error) throw new Error(error.message);
      }
    }
    // roundComplete: player enters next round, no match needed for current round
  };

  const handleAddPlayer = async (playerName: string) => {
    if (!tournament || !user) return;

    try {
      setAddingPlayer(true);
      setPlayersError(null);

      // For active tournaments, fetch current matches upfront so we can update pairings
      let currentMatches: Array<{
        id: string;
        round_number: number;
        player1_id: string;
        player2_id: string | null;
        status: string;
        match_number: number | null;
      }> = [];
      let maxRound = 1;
      if (tournament.status === "active") {
        const { data: matchData } = await supabase
          .from("tournament_matches")
          .select("id, round_number, player1_id, player2_id, status, match_number")
          .eq("tournament_id", tournament.id);
        currentMatches = matchData ?? [];
        if (currentMatches.length > 0) {
          maxRound = Math.max(...currentMatches.map((m) => m.round_number));
        }
      }

      const { data, error } = await supabase
        .from("tournament_players")
        .insert({
          name: playerName,
          tournament_id: tournament.id,
          created_by: user.id,
          workspace_id: workspaceId,
          ...(tournament.status === "active" && {
            is_late_entry: true,
            late_entry_round: maxRound,
          }),
        })
        .select("id, name, created_at")
        .single();

      if (error) {
        throw new Error(error.message || "Failed to add player");
      }

      if (tournament.status === "active" && data) {
        await applyLateEntryPairing(data.id, currentMatches, maxRound);
      }

      startTransition(() => {
        setPlayers((prev) => [...prev, data as TournamentPlayer]);
      });
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to add player");
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!tournament || !user) return;
    const names = bulkNames
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length === 0) return;

    setAddingBulk(true);
    setPlayersError(null);
    try {
      if (tournament.status !== "active") {
        // Draft: simple bulk insert
        const inserts = names.map((name) => ({
          name,
          tournament_id: tournament.id,
          created_by: user.id,
          workspace_id: workspaceId,
        }));
        const { data, error } = await supabase
          .from("tournament_players")
          .insert(inserts)
          .select("id, name, created_at");
        if (error) throw new Error(error.message || "Failed to add players");
        setPlayers((prev) => [...prev, ...(data as TournamentPlayer[])]);
      } else {
        // Active tournament: add one at a time so each pairing update sees the
        // current state of the matches (e.g. odd→even→odd alternation with byes)
        const { data: matchData } = await supabase
          .from("tournament_matches")
          .select("id, round_number, player1_id, player2_id, status, match_number")
          .eq("tournament_id", tournament.id);
        let currentMatches = matchData ?? [];
        const maxRound =
          currentMatches.length > 0
            ? Math.max(...currentMatches.map((m) => m.round_number))
            : 1;

        const addedPlayers: TournamentPlayer[] = [];
        for (const name of names) {
          const { data, error } = await supabase
            .from("tournament_players")
            .insert({
              name,
              tournament_id: tournament.id,
              created_by: user.id,
              workspace_id: workspaceId,
              is_late_entry: true,
              late_entry_round: maxRound,
            })
            .select("id, name, created_at")
            .single();
          if (error) throw new Error(error.message || `Failed to add ${name}`);
          addedPlayers.push(data as TournamentPlayer);

          await applyLateEntryPairing(data.id, currentMatches, maxRound);

          // Re-fetch matches so the next iteration sees up-to-date bye state
          const { data: refreshed } = await supabase
            .from("tournament_matches")
            .select("id, round_number, player1_id, player2_id, status, match_number")
            .eq("tournament_id", tournament.id);
          currentMatches = refreshed ?? [];
        }
        setPlayers((prev) => [...prev, ...addedPlayers]);
      }

      setBulkNames("");
      setBulkMode(false);
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to add players");
    } finally {
      setAddingBulk(false);
    }
  };

  const handleRoundStep = async (delta: number) => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    const current = numRounds ?? 3;
    const next = Math.min(20, Math.max(1, current + delta));
    if (next === current) return;
    setNumRounds(next);
    const { data, error } = await supabase
      .from("tournaments")
      .update({ num_rounds: next })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId ?? "")
      .select(
        "id, name, status, tournament_type, num_rounds, created_at, created_by",
      )
      .maybeSingle();
    if (!error && data) setTournament(data as TournamentSummary);
  };

  const handleResetToSuggested = async () => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    if (!suggestedRounds) return;
    setNumRounds(suggestedRounds);
    const { data, error } = await supabase
      .from("tournaments")
      .update({ num_rounds: suggestedRounds })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId ?? "")
      .select(
        "id, name, status, tournament_type, num_rounds, created_at, created_by",
      )
      .maybeSingle();
    if (!error && data) setTournament(data as TournamentSummary);
  };

  const handleTogglePublic = async (value: boolean) => {
    if (!tournament || !workspaceId) return;
    setSavingPublic(true);
    const { error } = await supabase
      .from("tournaments")
      .update({ is_public: value })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    setSavingPublic(false);
    if (!error) setTournament({ ...tournament, is_public: value });
  };

  const handleSetRoundDuration = async (minutes: number | null) => {
    if (!tournament || !workspaceId) return;
    setSavingTimer(true);
    const { error } = await supabase
      .from("tournaments")
      .update({ round_duration_minutes: minutes })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    setSavingTimer(false);
    if (!error) setTournament({ ...tournament, round_duration_minutes: minutes });
  };

  const handleDeletePlayer = (playerId: string) => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    setConfirmDeletePlayerId(playerId);
  };

  const handleConfirmDeletePlayer = async () => {
    const playerId = confirmDeletePlayerId;
    if (!playerId || !tournament || !user) return;
    if (!workspaceId) {
      setPlayersError("Workspace not loaded — cannot delete player");
      setConfirmDeletePlayerId(null);
      return;
    }
    setConfirmDeletePlayerId(null);

    try {
      setDeletingPlayerId(playerId);
      setPlayersError(null);

      const { error } = await supabase
        .from("tournament_players")
        .delete()
        .eq("id", playerId)
        .eq("tournament_id", tournament.id)
        .eq("workspace_id", workspaceId);

      if (error) {
        throw new Error(error.message || "Failed to delete player");
      }

      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    } catch (e: unknown) {
      setPlayersError(
        e instanceof Error ? e.message : "Failed to delete player",
      );
    } finally {
      setDeletingPlayerId(null);
    }
  };

  const handleUpdateStaticSeat = async (
    playerId: string,
    hasStaticSeating: boolean,
    seatNumber: number | null,
  ) => {
    if (!tournament || !user) return;
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

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? {
                ...p,
                has_static_seating: hasStaticSeating,
                static_seat_number: hasStaticSeating ? seatNumber : null,
              }
            : p,
        ),
      );
    } catch (e: unknown) {
      setPlayersError(
        e instanceof Error ? e.message : "Failed to update seating",
      );
    } finally {
      setSavingSeat(null);
    }
  };

  // ── Claim link handlers ──────────────────────────────────────────────────

  const handleGenerateClaimLink = async (playerId: string) => {
    if (!tournament) return;
    setGeneratingClaimId(playerId);
    try {
      const { data, error } = await supabase.rpc("create_player_claim_link", {
        p_tournament_player_id: playerId,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setClaimTokens((prev) => ({ ...prev, [playerId]: row.token as string }));
        setClaimIds((prev) => ({ ...prev, [playerId]: row.claim_id as string }));
      }
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to generate claim link");
    } finally {
      setGeneratingClaimId(null);
    }
  };

  const handleCopyClaimLink = async (playerId: string, token: string) => {
    const url = `${window.location.origin}/claim/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setPlayersError(null);
      setCopiedId(playerId);
      setTimeout(() => setCopiedId((prev) => (prev === playerId ? null : prev)), 2000);
    } catch {
      setCopiedId(null);
      setPlayersError("Failed to copy link to clipboard.");
    }
  };

  const handleRevokeClaimLink = async (playerId: string) => {
    const claimId = claimIds[playerId];
    if (!claimId) return;
    try {
      const { error } = await supabase.rpc("revoke_player_claim_link", {
        p_claim_id: claimId,
      });
      if (error) throw new Error(error.message);
      setClaimTokens((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
      setClaimIds((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to revoke claim link");
    }
  };

  // ── Rename player ────────────────────────────────────────────────────────

  const handleRenamePlayer = async (playerId: string, newName: string) => {
    const trimmed = newName.trim();
    const original = players.find((p) => p.id === playerId)?.name;
    setEditingNameId(null);
    if (!trimmed || trimmed === original) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, name: trimmed } : p)),
    );
    const { error } = await supabase
      .from("tournament_players")
      .update({ name: trimmed })
      .eq("id", playerId);
    if (error) {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, name: original ?? p.name } : p,
        ),
      );
      setPlayersError(error.message);
    }
  };

  // ── Known Players handlers ───────────────────────────────────────────────

  const handleOpenKnownPlayers = async () => {
    if (!workspaceId) return;
    setKnownPlayersOpen(true);
    setKnownPlayersLoading(true);
    setSelectedUserIds(new Set());
    setKnownPlayersSearch("");
    try {
      const { data, error } = await supabase.rpc("list_workspace_players", {
        p_workspace_id: workspaceId,
      });
      if (error) throw new Error(error.message);
      setKnownPlayers((data as WorkspacePlayer[]) ?? []);
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to load known players");
      setKnownPlayersOpen(false);
    } finally {
      setKnownPlayersLoading(false);
    }
  };

  const handleAddKnownPlayers = async () => {
    if (!tournament || selectedUserIds.size === 0) return;
    setAddingKnown(true);
    try {
      const { error } = await supabase.rpc("add_known_players_to_tournament", {
        p_tournament_id: tournament.id,
        p_user_ids: Array.from(selectedUserIds),
      });
      if (error) throw new Error(error.message);
      setKnownPlayersOpen(false);
      await refetchPlayers();
    } catch (e: unknown) {
      setPlayersError(e instanceof Error ? e.message : "Failed to add known players");
    } finally {
      setAddingKnown(false);
    }
  };

  const handleStartTournament = async () => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    if (!workspaceId) { setError("Workspace not loaded — cannot start tournament"); return; }
    if (players.length < 2) return;
    if (!numRounds || numRounds < 1) return;

    try {
      setStartingTournament(true);
      setError(null);

      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .update({ status: "active", num_rounds: numRounds, join_enabled: false })
        .eq("id", tournament.id)
        .eq("workspace_id", workspaceId)
        .select(
          "id, name, status, tournament_type, num_rounds, created_at, created_by",
        )
        .maybeSingle();

      if (tournamentError) {
        throw new Error(
          tournamentError.message || "Failed to start tournament",
        );
      }

      if (!tournamentData) {
        throw new Error("Failed to update tournament");
      }

      const pairings = generateRound1Pairings(
        tournament.tournament_type,
        players,
      );

      if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        throw new Error(
          `No pairings generated. Got: ${typeof pairings}, length: ${pairings?.length}`,
        );
      }

      // Apply static seat assignments
      const staticSeats = new Map<string, number>();
      players.forEach((p) => {
        if (p.has_static_seating && p.static_seat_number != null) {
          staticSeats.set(p.id, p.static_seat_number);
        }
      });
      const seatAssignments = assignMatchNumbers(pairings, staticSeats);

      const matchesToInsert = pairings.map((pairing, index) => ({
        tournament_id: tournament.id,
        workspace_id: workspaceId,
        round_number: 1,
        match_number: seatAssignments[index].matchNumber,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: pairing.player2Id === null ? "bye" : "ready",
        result: pairing.player2Id === null ? "bye" : null,
        winner_id: pairing.player2Id === null ? pairing.player1Id : null,
      }));

      const { data: insertedMatches, error: matchesError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert)
        .select();

      if (matchesError) {
        const { error: rollbackError } = await supabase
          .from("tournaments")
          .update({ status: "draft" })
          .eq("id", tournament.id);
        if (rollbackError) {
          throw new Error(
            `Failed to create round 1 matches: ${matchesError.message}. Tournament status could not be reverted: ${rollbackError.message}`,
          );
        }
        throw new Error(
          `Failed to create round 1 matches: ${matchesError.message}`,
        );
      }

      if (!insertedMatches || insertedMatches.length === 0) {
        const { error: rollbackError } = await supabase
          .from("tournaments")
          .update({ status: "draft" })
          .eq("id", tournament.id);
        if (rollbackError) {
          throw new Error(
            `Failed to create matches and tournament status could not be reverted: ${rollbackError.message}`,
          );
        }
        throw new Error(
          `Failed to create matches - expected ${matchesToInsert.length} matches but got ${insertedMatches?.length ?? 0}`,
        );
      }

      setTournament(tournamentData as TournamentSummary);
      navigate(wPath(`/tournaments/${tournamentData.id}/matches`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start tournament");
    } finally {
      setStartingTournament(false);
    }
  };

  if (authLoading || loading) {
    return <PageLoading />;
  }

  if (error || !tournament) {
    return (
      <Box>
        <TournamentPageHeader
          title="Tournament"
          onBack={() => navigate(wPath("/tournaments"))}
        />
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
      <TournamentPageHeader
        title={tournament.name}
        onBack={() => navigate(wPath("/tournaments"))}
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          mb={1}
        >
          <Typography variant="subtitle1" gutterBottom>
            Basic Details
          </Typography>
          {tournament.status !== "draft" && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(wPath(`/tournaments/${tournament.id}/matches`))}
            >
              View matches
            </Button>
          )}
        </Box>
        <Box display="flex" flexDirection="column" gap={1}>
          <Box display="flex" gap={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Status:
            </Typography>
            <Chip label={tournament.status} size="small" />
          </Box>
          <Box display="flex" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Type:
            </Typography>
            <Typography variant="body2">
              {getTournamentTypeLabel(tournament.tournament_type)}
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Created at:
            </Typography>
            <Typography variant="body2">
              {formatDateTime(tournament.created_at)}
            </Typography>
          </Box>
          {tournament.num_rounds && tournament.status !== "draft" && (
            <Box display="flex" gap={1}>
              <Typography variant="body2" color="text.secondary">
                Number of Rounds:
              </Typography>
              <Typography variant="body2">{tournament.num_rounds}</Typography>
            </Box>
          )}
        </Box>
        {tournament.status === "draft" && (
          <Box mt={2} display="flex" flexDirection="column" gap={2}>
            <Box display="flex" flexDirection="column" gap={1}>
              <Typography variant="subtitle2">
                Number of Rounds
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <IconButton
                  size="small"
                  onClick={() => handleRoundStep(-1)}
                  disabled={!numRounds || numRounds <= 1}
                  aria-label="Decrease rounds"
                >
                  −
                </IconButton>
                <Typography
                  variant="h6"
                  component="span"
                  sx={{ minWidth: 32, textAlign: "center" }}
                >
                  {numRounds ?? "—"}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => handleRoundStep(1)}
                  disabled={!!numRounds && numRounds >= 20}
                  aria-label="Increase rounds"
                >
                  +
                </IconButton>
                {players.length >= 2 && numRounds !== suggestedRounds && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={handleResetToSuggested}
                    sx={{ ml: 0.5, textTransform: "none", fontSize: "0.75rem" }}
                  >
                    Use suggested ({suggestedRounds})
                  </Button>
                )}
              </Box>
              <Tooltip title="Swiss standard: ≤8 players → 3 rounds, 9–16 → 4, 17–32 → 5, 33–64 → 6">
                <Typography variant="caption" color="text.secondary" sx={{ cursor: "help", textDecoration: "underline dotted" }}>
                  {players.length < 2
                    ? "Add players to see a suggestion."
                    : numRounds === suggestedRounds
                      ? `Suggested for ${players.length} players (Swiss standard)`
                      : `Suggested: ${suggestedRounds} for ${players.length} players (Swiss standard)`}
                </Typography>
              </Tooltip>
              {players.length >= 2 && players.length % 2 !== 0 && (
                <Typography variant="caption" color="text.secondary">
                  With {players.length} players (odd number), one player will receive a bye each round.
                </Typography>
              )}
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={!!tournament.is_public}
                  onChange={(e) => void handleTogglePublic(e.target.checked)}
                  disabled={savingPublic}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Public tournament</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Anyone with the link can view pairings without logging in
                  </Typography>
                </Box>
              }
            />
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={() => setConfirmStartOpen(true)}
              disabled={
                startingTournament ||
                players.length < 2 ||
                !numRounds ||
                numRounds < 1
              }
            >
              Start tournament
            </Button>
            <Typography variant="caption" color="text.secondary">
              {players.length < 2
                ? "Add at least 2 players before starting."
                : !numRounds || numRounds < 1
                  ? "Set the number of rounds before starting."
                  : "Once started, players can no longer be removed."}
            </Typography>
          </Box>
        )}
        {isManager && (
          <Box mt={2}>
            <FormControlLabel
              control={
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
              }
              label={
                <Box>
                  <Typography variant="body2">Round timer</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Countdown shown on the matches and pairings pages
                  </Typography>
                </Box>
              }
            />
            {!!tournament.round_duration_minutes && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, ml: 4, flexWrap: "wrap" }}>
                <TextField
                  type="number"
                  size="small"
                  label="Duration (minutes)"
                  value={timerDurationInput ?? tournament.round_duration_minutes.toString()}
                  onChange={(e) => setTimerDurationInput(e.target.value)}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setTimerDurationInput(null);
                    if (!isNaN(v) && v >= 1 && v <= 180 && v !== tournament.round_duration_minutes) {
                      void handleSetRoundDuration(v);
                    }
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  inputProps={{ min: 1, max: 180, step: 1 }}
                  sx={{ width: 160 }}
                  disabled={savingTimer}
                />
                {([-10, -1, 1, 10] as const).map((delta) => {
                  const next = (tournament.round_duration_minutes ?? 0) + delta;
                  const disabled = savingTimer || next < 1 || next > 180;
                  return (
                    <Button
                      key={delta}
                      size="small"
                      variant="outlined"
                      disabled={disabled}
                      onClick={() => void handleSetRoundDuration(next)}
                      sx={{ minWidth: 0, px: 1 }}
                    >
                      {delta > 0 ? `+${delta}m` : `${delta}m`}
                    </Button>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        {isNewTournament && players.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Tournament created! Now add your players below — use <strong>Bulk add</strong> to add them all at once.
          </Alert>
        )}
        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
          <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
            Players ({players.length})
          </Typography>
          {players.length > 0 && (
            <Tooltip title={copiedPlayerList ? "Copied!" : "Copy player list to clipboard"}>
              <Button
                size="small"
                variant="text"
                startIcon={<ContentCopyIcon fontSize="inherit" />}
                onClick={() => {
                  const text = players.map((p) => p.name).join("\n");
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopiedPlayerList(true);
                    setTimeout(() => setCopiedPlayerList(false), 2000);
                  }).catch(() => {
                    setPlayersError("Failed to copy player list to clipboard.");
                  });
                }}
              >
                {copiedPlayerList ? "Copied!" : "Copy list"}
              </Button>
            </Tooltip>
          )}
        </Box>
        {playersError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {playersError}
          </Alert>
        )}

        {/* ── Add from Known Players (draft + manager only) ──────────── */}
        {tournament.status === "draft" && isManager && (
          <Box mb={2} display="flex" alignItems="center" gap={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PeopleIcon />}
              onClick={() => void handleOpenKnownPlayers()}
            >
              Add from Known Players
            </Button>
          </Box>
        )}

        {/* ── Self-registration (draft + manager only) ──────────────── */}
        {tournament.status === "draft" && isManager && (
          <Box mb={2}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={tournament.join_enabled ?? false}
                  onChange={(e) => void handleToggleJoinEnabled(e.target.checked)}
                />
              }
              label="Allow self-registration"
            />
            {tournament.join_enabled && (
              <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", color: "text.secondary" }}
                >
                  {`${window.location.origin}/join/${tournament.id}`}
                </Typography>
                <Tooltip title={copiedJoinLink ? "Copied!" : "Copy link"}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/join/${tournament.id}`,
                      ).then(() => {
                        setCopiedJoinLink(true);
                        setTimeout(() => setCopiedJoinLink(false), 2000);
                      });
                    }}
                  >
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Display QR code">
                  <IconButton
                    size="small"
                    onClick={() => navigate(wPath(`/tournaments/${tournament.id}/join-display`))}
                  >
                    <QrCode2Icon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        )}

        {!bulkMode ? (
          <AddPlayerInput
            onAdd={handleAddPlayer}
            disabled={addingPlayer}
            inputRef={playerNameInputRef}
            onBulkMode={() => setBulkMode(true)}
          />
        ) : (
          <Box display="flex" flexDirection="column" gap={1} mb={2}>
            <TextField
              label="One name per line"
              multiline
              minRows={4}
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
              size="small"
              placeholder={"Alice\nBob\nCharlie"}
              autoFocus
            />
            <Box display="flex" gap={1}>
              <Button
                variant="contained"
                onClick={() => void handleBulkAdd()}
                disabled={
                  addingBulk ||
                  bulkNames
                    .split("\n")
                    .map((n) => n.trim())
                    .filter((n) => n.length > 0).length === 0
                }
              >
                {addingBulk
                  ? "Adding…"
                  : `Add ${
                      bulkNames
                        .split("\n")
                        .map((n) => n.trim())
                        .filter((n) => n.length > 0).length
                    } Players`}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setBulkMode(false);
                  setBulkNames("");
                }}
                disabled={addingBulk}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        {playersLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        ) : players.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No players added yet. Add your first player above.
          </Typography>
        ) : (
          <>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <TextField
                size="small"
                placeholder="Search players…"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                sx={{ flexGrow: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: playerSearch ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setPlayerSearch("")}>
                        ✕
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              <Chip
                size="small"
                label={
                  playerSearch.trim()
                    ? `${filteredPlayers.length} of ${players.length}`
                    : `${players.length} player${players.length === 1 ? "" : "s"}`
                }
              />
            </Box>
            {filteredPlayers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" py={1}>
                No players match your search.
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={playerSort === "name"}
                          direction={playerSort === "name" ? playerSortDir : "asc"}
                          onClick={() => {
                            if (playerSort === "name") setPlayerSortDir((d) => d === "asc" ? "desc" : "asc");
                            else { setPlayerSort("name"); setPlayerSortDir("asc"); }
                          }}
                        >
                          Name
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={playerSort === "joined"}
                          direction={playerSort === "joined" ? playerSortDir : "asc"}
                          onClick={() => {
                            if (playerSort === "joined") setPlayerSortDir((d) => d === "asc" ? "desc" : "asc");
                            else { setPlayerSort("joined"); setPlayerSortDir("asc"); }
                          }}
                        >
                          Joined
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Static Seating</TableCell>
                      {isManager && <TableCell>Account</TableCell>}
                      {tournament.status === "draft" && (
                        <TableCell align="right">Remove</TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPlayers.map((player) => {
                      const isSavingSeat = savingSeat === player.id;
                      const claimToken = claimTokens[player.id];
                      const isGenerating = generatingClaimId === player.id;
                      const wasCopied = copiedId === player.id;
                      return (
                        <TableRow key={player.id}>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={0.5}>
                              {isManager && editingNameId === player.id ? (
                                <TextField
                                  size="small"
                                  autoFocus
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  onBlur={() => void handleRenamePlayer(player.id, editingNameValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleRenamePlayer(player.id, editingNameValue);
                                    if (e.key === "Escape") setEditingNameId(null);
                                  }}
                                  sx={{ width: 160 }}
                                />
                              ) : (
                                <>
                                  {player.name}
                                  {isManager && (
                                    <Tooltip title="Edit name">
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          setEditingNameId(player.id);
                                          setEditingNameValue(player.name);
                                        }}
                                      >
                                        <EditIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </>
                              )}
                              {player.has_static_seating && (
                                <Tooltip
                                  title={
                                    player.static_seat_number != null
                                      ? `Fixed at table ${player.static_seat_number}`
                                      : "Static seating (no table number)"
                                  }
                                >
                                  <SeatIcon />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {formatDateTime(player.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Switch
                                size="small"
                                checked={player.has_static_seating ?? false}
                                disabled={isSavingSeat}
                                onChange={(e) =>
                                  void handleUpdateStaticSeat(
                                    player.id,
                                    e.target.checked,
                                    player.static_seat_number ?? null,
                                  )
                                }
                              />
                              {player.has_static_seating && (
                                <TextField
                                  size="small"
                                  placeholder="Table #"
                                  type="number"
                                  disabled={isSavingSeat}
                                  value={player.static_seat_number ?? ""}
                                  onChange={(e) => {
                                    const val =
                                      e.target.value === ""
                                        ? null
                                        : parseInt(e.target.value, 10);
                                    void handleUpdateStaticSeat(
                                      player.id,
                                      true,
                                      val,
                                    );
                                  }}
                                  inputProps={{ min: 1 }}
                                  sx={{ width: 90 }}
                                />
                              )}
                              {isSavingSeat && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Saving…
                                </Typography>
                              )}
                            </Box>
                          </TableCell>

                          {/* ── Account / Link column ───────────────── */}
                          {isManager && (
                            <TableCell>
                              {player.user_id ? (
                                <Chip label="Linked" size="small" color="success" />
                              ) : claimToken ? (
                                <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontFamily: "monospace",
                                      maxWidth: 140,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {`${window.location.origin}/claim/${claimToken}`}
                                  </Typography>
                                  <Tooltip title={wasCopied ? "Copied!" : "Copy link"}>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCopyClaimLink(player.id, claimToken)}
                                    >
                                      <ContentCopyIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Revoke">
                                    <IconButton
                                      size="small"
                                      onClick={() => void handleRevokeClaimLink(player.id)}
                                    >
                                      <DeleteIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ) : (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={isGenerating ? <CircularProgress size={12} /> : <LinkIcon />}
                                  disabled={isGenerating}
                                  onClick={() => void handleGenerateClaimLink(player.id)}
                                >
                                  Link
                                </Button>
                              )}
                            </TableCell>
                          )}

                          {tournament.status === "draft" && (
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                color="error"
                                aria-label="Remove player"
                                onClick={() => handleDeletePlayer(player.id)}
                                disabled={deletingPlayerId === player.id}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Paper>

      {/* ── Known Players dialog ──────────────────────────────────────── */}
      <Dialog
        open={knownPlayersOpen}
        onClose={() => setKnownPlayersOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add from Known Players</DialogTitle>
        <DialogContent>
          <TextField
            placeholder="Search by name…"
            size="small"
            fullWidth
            value={knownPlayersSearch}
            onChange={(e) => setKnownPlayersSearch(e.target.value)}
            sx={{ mb: 1, mt: 0.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          {knownPlayersLoading ? (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress size={24} />
            </Box>
          ) : knownPlayers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" py={2}>
              No known players yet. Players appear here once they claim a link.
            </Typography>
          ) : (
            <List dense disablePadding sx={{ maxHeight: 360, overflowY: "auto" }}>
              {knownPlayers
                .filter((kp) => {
                  const label = (kp.preferred_name ?? kp.display_name ?? "").toLowerCase();
                  return label.includes(knownPlayersSearch.toLowerCase());
                })
                .map((kp) => {
                  const label = kp.preferred_name ?? kp.display_name ?? kp.user_id;
                  const selected = selectedUserIds.has(kp.user_id);
                  // Grey out if already in this tournament
                  const alreadyAdded = players.some((p) => p.user_id === kp.user_id);
                  return (
                    <ListItem key={kp.user_id} disablePadding>
                      <ListItemButton
                        disabled={alreadyAdded}
                        onClick={() => {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(kp.user_id)) next.delete(kp.user_id);
                            else next.add(kp.user_id);
                            return next;
                          });
                        }}
                      >
                        <Checkbox
                          edge="start"
                          checked={selected}
                          disabled={alreadyAdded}
                          tabIndex={-1}
                          disableRipple
                          size="small"
                        />
                        <ListItemText
                          primary={label}
                          secondary={alreadyAdded ? "Already in tournament" : undefined}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKnownPlayersOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={selectedUserIds.size === 0 || addingKnown}
            onClick={() => void handleAddKnownPlayers()}
          >
            {addingKnown ? "Adding…" : `Add ${selectedUserIds.size > 0 ? selectedUserIds.size : ""} Player${selectedUserIds.size === 1 ? "" : "s"}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmStartOpen} onClose={() => setConfirmStartOpen(false)}>
        <DialogTitle>Start tournament?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body1" gutterBottom>
              This will generate Round 1 pairings for{" "}
              <strong>{players.length} player{players.length !== 1 ? "s" : ""}</strong>{" "}
              across{" "}
              <strong>{numRounds} round{numRounds !== 1 ? "s" : ""}</strong>.
              {players.length % 2 !== 0 && " One player will receive a bye each round."}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Players cannot be removed once the tournament has started.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmStartOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={startingTournament}
            onClick={() => {
              setConfirmStartOpen(false);
              void handleStartTournament();
            }}
          >
            Start tournament
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmDeletePlayerId !== null}
        onClose={() => setConfirmDeletePlayerId(null)}
      >
        <DialogTitle>Remove player?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {(() => {
              const player = players.find(
                (p) => p.id === confirmDeletePlayerId,
              );
              return player
                ? `Remove "${player.name}" from the tournament? This cannot be undone.`
                : "Remove this player from the tournament? This cannot be undone.";
            })()}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeletePlayerId(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => void handleConfirmDeletePlayer()}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TournamentView;
