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
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Switch,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  InputAdornment,
  Snackbar,
} from "@mui/material";
import { formatLabel, getGame } from "../games/registry";
import SeatIcon from "@mui/icons-material/EventSeat";
import { PlayArrow as PlayArrowIcon, Add as AddIcon, Remove as RemoveIcon } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import LinkIcon from "@mui/icons-material/Link";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import PageLoading from "../components/PageLoading";
import Breadcrumbs from "../components/Breadcrumbs";
import PushOptIn from "../components/PushOptIn";
import DeckPickerDialog from "../components/DeckPickerDialog";
import PlayerClaimLinkDialog from "../components/PlayerClaimLinkDialog";
import PlayerNameInput, { type PlayerNameSelection } from "../components/PlayerNameInput";
import { useWorkspacePlayers, type WorkspacePlayer } from "../hooks/useWorkspacePlayers";
import NormalizedSprite from "../components/NormalizedSprite";
import { getSpriteUrl } from "../utils/pokemonCache";
import { useTournament } from "../hooks/useTournament";
import { useWorkspace } from "../WorkspaceContext";
import { useTournamentPlayers } from "../hooks/useTournamentPlayers";
import type { TournamentSummary, TournamentPlayer } from "../types/tournament";
import { formatDateTime } from "../utils/format";
import {
  getTournamentTypeLabel,
  assignMatchNumbers,
} from "../utils/tournamentUtils";
import { generateRound1Pairings } from "../utils/tournamentPairing";

// Isolated component so typing only re-renders this small subtree, not the whole page.
interface AddPlayerInputProps {
  onAdd: (name: string, userId: string | null) => Promise<void>;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onBulkMode: () => void;
  knownPlayers: WorkspacePlayer[];
  excludeUserIds: string[];
}

const AddPlayerInput: React.FC<AddPlayerInputProps> = ({
  onAdd, disabled, inputRef, onBulkMode, knownPlayers, excludeUserIds,
}) => {
  const [selection, setSelection] = useState<PlayerNameSelection>({ name: "", userId: null });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = selection.name.trim();
    if (!trimmed || disabled) return;
    await onAdd(trimmed, selection.userId);
    setSelection({ name: "", userId: null });
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
      <PlayerNameInput
        value={selection}
        onChange={setSelection}
        knownPlayers={knownPlayers}
        excludeUserIds={excludeUserIds}
        inputRef={inputRef}
        disabled={disabled}
      />
      <Button
        type="submit"
        variant="contained"
        disabled={disabled || !selection.name.trim()}
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

/** ISO timestamp → value for a <input type="datetime-local"> (local time). */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (local time) → ISO timestamp, or null if empty/invalid. */
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const [savingTimer, setSavingTimer] = useState(false);
  const [timerDurationInput, setTimerDurationInput] = useState<string | null>(null);
  const [numRounds, setNumRounds] = useState<number | null>(null);
  const [startsAtInput, setStartsAtInput] = useState("");
  const [formatInput, setFormatInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [savingSeat, setSavingSeat] = useState<string | null>(null);
  const playerNameInputRef = useRef<HTMLInputElement>(null);

  const [copiedPlayerList, setCopiedPlayerList] = useState(false);

  // ── Self-registration toggle ─────────────────────────────────────────────
  const [copiedJoinLink, setCopiedJoinLink] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // ── Inline name editing ───────────────────────────────────────────────────
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Games with no deck (generic events) show no deck column at all.
  const hasDecks = getGame(tournament?.game_id).deck !== "none";

  // ── Deck editing (organiser sets a deck on a player's behalf) ────────────
  const [deckPlayerId, setDeckPlayerId] = useState<string | null>(null);

  // ── Account linking (organiser hands a player a claim link) ──────────────
  const [claimPlayerId, setClaimPlayerId] = useState<string | null>(null);

  // ── Late joins (players adding themselves after the tournament starts) ──
  const [allowLateJoin, setAllowLateJoin] = useState(false);
  const [savingLateJoin, setSavingLateJoin] = useState(false);

  // Mirror the loaded tournament into local toggle state.
  useEffect(() => {
    setAllowLateJoin(Boolean(tournament?.allow_late_join));
  }, [tournament?.allow_late_join]);

  const handleToggleLateJoin = async (enabled: boolean) => {
    if (!tournament) return;
    setSavingLateJoin(true);
    setPlayersError(null);
    const { data, error } = await supabase.rpc("set_tournament_allow_late_join", {
      p_tournament_id: tournament.id,
      p_enabled: enabled,
    });
    setSavingLateJoin(false);
    if (error) {
      setPlayersError(error.message || "Failed to update late joins");
      return;
    }
    setAllowLateJoin(enabled);
    const row = Array.isArray(data) ? data[0] : data;
    const code = (row as { join_code: string | null } | null)?.join_code ?? null;
    if (code) setTournament((prev) => (prev ? { ...prev, join_code: code } : prev));
  };

  // ── Known players (workspace regulars, for the add-player picker) ────────
  const { knownPlayers } = useWorkspacePlayers(workspaceId);
  const linkedUserIds = useMemo(
    () => players.map((p) => p.user_id).filter((id): id is string => Boolean(id)),
    [players],
  );

  // ── Player list search/sort ───────────────────────────────────────────────
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSort, setPlayerSort] = useState<"name" | "joined">("joined");
  const [playerSortDir, setPlayerSortDir] = useState<"asc" | "desc">("asc");


  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (tournament) {
      setNumRounds(tournament.num_rounds ?? 3);
      setStartsAtInput(isoToLocalInput(tournament.starts_at));
      setFormatInput(tournament.game_format ?? "");
      setLocationInput(tournament.location ?? "");
      setDescriptionInput(tournament.description ?? "");
    }
  }, [tournament]);


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
  // Late-entry pairing lives in SQL (apply_late_entry_pairing). It has to:
  // a joining player is not a workspace member, so RLS blocks them from writing
  // tournament_matches on their own client. One implementation serves the
  // organiser paths here and the player self-join path, so they cannot drift.
  const applyLateEntryPairing = async (newPlayerId: string) => {
    const { error } = await supabase.rpc("apply_late_entry_pairing", {
      p_player_id: newPlayerId,
      p_tournament_id: tournament!.id,
    });
    if (error) throw new Error(error.message);
  };

  const handleAddPlayer = async (playerName: string, knownUserId: string | null = null) => {
    if (!tournament || !user) return;
    if (!workspaceId) {
      setPlayersError("Workspace not loaded, so the player can't be added");
      return;
    }

    try {
      setAddingPlayer(true);
      setPlayersError(null);

      // Which round a late entry is joining at. The pairing itself is worked
      // out server-side from live match state.
      let maxRound = 1;
      if (tournament.status === "active") {
        const { data: matchData } = await supabase
          .from("tournament_matches")
          .select("round_number")
          .eq("tournament_id", tournament.id);
        if ((matchData?.length ?? 0) > 0) {
          maxRound = Math.max(...matchData!.map((m) => m.round_number));
        }
      }

      // A known player goes through add_known_players_to_tournament, which
      // validates workspace membership server-side and sets user_id, so the
      // entry is account-linked from birth. A typed name is a plain insert.
      let data: TournamentPlayer | null = null;

      if (knownUserId) {
        const { data: rows, error: rpcError } = await supabase.rpc(
          "add_known_players_to_tournament",
          {
            p_tournament_id: tournament.id,
            p_user_ids: [knownUserId],
            p_is_late_entry: tournament.status === "active",
            p_late_entry_round:
              tournament.status === "active" ? maxRound : undefined,
          },
        );
        if (rpcError) throw new Error(rpcError.message || "Failed to add player");
        const row = (rows as Array<{ player_id: string; name: string; created_at: string; user_id: string }> | null)?.[0];
        if (!row) throw new Error(`${playerName} is already in this tournament.`);
        data = {
          id: row.player_id,
          name: row.name,
          created_at: row.created_at,
          user_id: row.user_id,
          created_by: user.id,
          ...(tournament.status === "active" && {
            is_late_entry: true,
            late_entry_round: maxRound,
          }),
        };
      } else {
        const { data: inserted, error } = await supabase
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
        data = inserted as TournamentPlayer;
      }

      if (tournament.status === "active" && data) {
        await applyLateEntryPairing(data.id);
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
    if (!workspaceId) {
      setPlayersError("Workspace not loaded, so the players can't be added");
      return;
    }
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
        // current state of the matches (e.g. odd→even→odd alternation with byes).
        // apply_late_entry_pairing reads that state itself on every call.
        const { data: matchData } = await supabase
          .from("tournament_matches")
          .select("round_number")
          .eq("tournament_id", tournament.id);
        const maxRound =
          (matchData?.length ?? 0) > 0
            ? Math.max(...matchData!.map((m) => m.round_number))
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

          await applyLateEntryPairing(data.id);
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

  const handleSetRounds = async (target: number) => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    const next = Math.min(20, Math.max(1, target));
    if (next === numRounds) return;
    setNumRounds(next);
    const { data, error } = await supabase
      .from("tournaments")
      .update({ num_rounds: next })
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId ?? "")
      .select(
        "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, join_enabled, join_code, allow_late_join, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note, starts_at, game_format, location, description, game_id",
      )
      .maybeSingle();
    if (!error && data) setTournament(data as TournamentSummary);
  };

  const handleRoundStep = (delta: number) => {
    void handleSetRounds((numRounds ?? 3) + delta);
  };

  const handleSaveDetails = async () => {
    if (!tournament || !workspaceId) return;
    setSavingDetails(true);
    setDetailsError("");
    const updates = {
      starts_at: localInputToIso(startsAtInput),
      game_format: formatInput.trim() || null,
      location: locationInput.trim() || null,
      description: descriptionInput.trim() || null,
    };
    const { error } = await supabase
      .from("tournaments")
      .update(updates)
      .eq("id", tournament.id)
      .eq("workspace_id", workspaceId);
    setSavingDetails(false);
    if (error) {
      setDetailsError(error.message);
      return;
    }
    setTournament({ ...tournament, ...updates });
    setCopyToast("Details saved");
  };

  // Swiss convention: ceil(log2(players)) rounds. Suggested only as a hint.
  const suggestedRounds =
    players.length >= 2 ? Math.max(1, Math.ceil(Math.log2(players.length))) : null;

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
      setPlayersError("Workspace not loaded, so the player can't be deleted");
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

  // ── Deck ─────────────────────────────────────────────────────────────────
  // Organisers can set a deck for any player, which matters most for players
  // they added themselves — those players never see the self-registration
  // deck picker, so their deck would otherwise stay empty.

  const handleSaveDeck = async (
    playerId: string,
    pokemon1: number | null,
    pokemon2: number | null,
  ) => {
    const { error } = await supabase
      .from("tournament_players")
      .update({ deck_pokemon1: pokemon1, deck_pokemon2: pokemon2 })
      .eq("id", playerId)
      .eq("tournament_id", tournament?.id ?? "");
    if (error) throw new Error(error.message || "Failed to save deck");

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, deck_pokemon1: pokemon1, deck_pokemon2: pokemon2 }
          : p,
      ),
    );
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


  const handleStartTournament = async () => {
    if (!tournament || tournament.status !== "draft" || !user) return;
    if (!workspaceId) { setError("Workspace not loaded, so the tournament can't be started"); return; }
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
          "id, name, status, tournament_type, num_rounds, created_at, created_by, is_public, public_slug, join_enabled, join_code, allow_late_join, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note, starts_at, game_format, location, description, game_id",
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
        status: "ready",
        result: null,
        winner_id: null,
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
        <Breadcrumbs
          items={[
            { label: "Dashboard", to: "/dashboard" },
            { label: "Tournaments", to: wPath("/tournaments") },
            { label: "Tournament" },
          ]}
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
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Tournaments", to: wPath("/tournaments") },
          { label: tournament.name },
        ]}
      />
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        {tournament.name}
      </Typography>

      <PushOptIn variant="organiser" tournamentId={tournament.id} />

      <Paper sx={{ p: 3, mb: 3 }}>
        {/* Status chip */}
        <Box mb={2}>
          <Chip
            label={tournament.status}
            size="small"
            color={
              tournament.status === "active"
                ? "success"
                : tournament.status === "completed"
                ? "primary"
                : "default"
            }
            sx={{ fontWeight: 500, textTransform: "capitalize" }}
          />
        </Box>

        {/* Info rows */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 2,
            rowGap: 0.75,
            alignItems: "center",
            bgcolor: "action.hover",
            borderRadius: 1,
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">Type</Typography>
          <Typography variant="body2">{getTournamentTypeLabel(tournament.tournament_type)}</Typography>

          <Typography variant="body2" color="text.secondary">Created</Typography>
          <Typography variant="body2">{formatDateTime(tournament.created_at)}</Typography>

          {tournament.starts_at && (
            <>
              <Typography variant="body2" color="text.secondary">Date</Typography>
              <Typography variant="body2">{formatDateTime(tournament.starts_at)}</Typography>
            </>
          )}
          {tournament.game_format && (
            <>
              <Typography variant="body2" color="text.secondary">Format</Typography>
              <Typography variant="body2">
                {formatLabel(tournament.game_id, tournament.game_format)}
              </Typography>
            </>
          )}
          {tournament.location && (
            <>
              <Typography variant="body2" color="text.secondary">Location</Typography>
              <Typography variant="body2">{tournament.location}</Typography>
            </>
          )}

          {tournament.num_rounds && tournament.status !== "draft" && (
            <>
              <Typography variant="body2" color="text.secondary">Rounds</Typography>
              <Typography variant="body2">{tournament.num_rounds}</Typography>
            </>
          )}
        </Box>

        {tournament.description && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Description
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {tournament.description}
            </Typography>
          </Box>
        )}

        {tournament.status !== "draft" && (
          <Button
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 2 }}
            onClick={() => navigate(wPath(`/tournaments/${tournament.id}/matches`))}
          >
            View matches
          </Button>
        )}

        {tournament.status === "draft" && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" flexDirection="column" gap={2}>
              {/* Event details */}
              <Box display="flex" flexDirection="column" gap={1.5}>
                <Typography variant="subtitle2">Details</Typography>
                <TextField
                  label="Date & time"
                  type="datetime-local"
                  size="small"
                  value={startsAtInput}
                  onChange={(e) => setStartsAtInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                {/*
                  Formats come from the game's registry entry rather than being
                  typed. A game with no formats (generic) has nothing to ask.
                  Any value already stored that the registry does not know —
                  free text from before games existed — is offered as an extra
                  option so saving the panel cannot silently discard it.
                */}
                {getGame(tournament.game_id).formats.length > 0 && (
                  <FormControl size="small" fullWidth>
                    <InputLabel id="details-format-label">Format</InputLabel>
                    <Select
                      labelId="details-format-label"
                      label="Format"
                      value={formatInput}
                      onChange={(e) => setFormatInput(e.target.value)}
                    >
                      <MenuItem value="">
                        <em>Not set</em>
                      </MenuItem>
                      {getGame(tournament.game_id).formats.map((f) => (
                        <MenuItem key={f.id} value={f.id}>
                          {f.name}
                        </MenuItem>
                      ))}
                      {formatInput &&
                        !getGame(tournament.game_id).formats.some((f) => f.id === formatInput) && (
                          <MenuItem value={formatInput}>{formatInput}</MenuItem>
                        )}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  label="Location"
                  size="small"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  placeholder="Venue or 'Online'"
                  inputProps={{ maxLength: 120 }}
                  fullWidth
                />
                <TextField
                  label="Description"
                  size="small"
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Entry fee, prizes, what to bring…"
                  multiline
                  minRows={2}
                  inputProps={{ maxLength: 2000 }}
                  fullWidth
                />
                {detailsError && <Alert severity="error">{detailsError}</Alert>}
                <Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void handleSaveDetails()}
                    disabled={
                      savingDetails ||
                      (startsAtInput === isoToLocalInput(tournament.starts_at) &&
                        formatInput === (tournament.game_format ?? "") &&
                        locationInput === (tournament.location ?? "") &&
                        descriptionInput === (tournament.description ?? ""))
                    }
                  >
                    {savingDetails ? "Saving…" : "Save details"}
                  </Button>
                </Box>
              </Box>
              <Divider />
              {/* Round count stepper */}
              <Box display="flex" flexDirection="column" gap={0.75}>
                <Typography variant="subtitle2">Number of Rounds</Typography>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <IconButton
                    size="small"
                    onClick={() => handleRoundStep(-1)}
                    disabled={!numRounds || numRounds <= 1}
                    aria-label="Decrease rounds"
                  >
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                  <Typography
                    variant="h6"
                    component="span"
                    sx={{ minWidth: 36, textAlign: "center", fontWeight: 600 }}
                  >
                    {numRounds ?? "—"}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => handleRoundStep(1)}
                    disabled={!!numRounds && numRounds >= 20}
                    aria-label="Increase rounds"
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Box>
                {suggestedRounds !== null && suggestedRounds !== numRounds && (
                  <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                    <Typography variant="caption" color="text.secondary">
                      Suggested: {suggestedRounds} for {players.length} players
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      sx={{ minWidth: 0, py: 0, px: 0.5 }}
                      onClick={() => void handleSetRounds(suggestedRounds)}
                    >
                      Use {suggestedRounds}
                    </Button>
                  </Box>
                )}
              </Box>

<Box>
                <Button
                  variant="contained"
                  color="primary"
                  size="medium"
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
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  {players.length < 2
                    ? "Add at least 2 players before starting."
                    : !numRounds || numRounds < 1
                      ? "Set the number of rounds before starting."
                      : "Once started, players can no longer be removed."}
                </Typography>
              </Box>
            </Box>
          </>
        )}

        {isManager && (
          <>
            <Divider sx={{ my: 2 }} />
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
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
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
          </>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        {isNewTournament && players.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Tournament created. Now add your players below, or use <strong>Bulk add</strong> to paste them all in at once.
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
                    setCopyToast("Copied!");
                  }).catch(() => {
                    setPlayersError("Failed to copy player list to clipboard.");
                    setCopyToast("Couldn't copy. Please try again.");
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


        {/* ── Self-registration (draft + manager only) ──────────────── */}
        {tournament.status === "draft" && isManager && tournament.join_code && (
          <Box mb={2}>
            <Box mt={1}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Room code
                  </Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ letterSpacing: 2, fontFamily: "monospace" }}
                  >
                    {tournament.join_code}
                  </Typography>
                  <Tooltip title={copiedJoinLink ? "Copied!" : "Copy link"}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/join/c/${tournament.join_code}`,
                        ).then(() => {
                          setCopiedJoinLink(true);
                          setTimeout(() => setCopiedJoinLink(false), 2000);
                          setCopyToast("Copied!");
                        }).catch(() => {
                          setCopyToast("Couldn't copy. Please try again.");
                        });
                      }}
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<QrCode2Icon />}
                    onClick={() => window.open(wPath(`/tournaments/${tournament.id}/join-display`), "_blank")}
                  >
                    Display join info
                  </Button>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", color: "text.secondary", display: "block", mt: 0.5 }}
                >
                  {`${window.location.origin}/join/c/${tournament.join_code}`}
                </Typography>
              </Box>
          </Box>
        )}

        {/* ── Late joins (active + manager only) ────────────────────── */}
        {tournament.status === "active" && isManager && (
          <Box mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Switch
                size="small"
                checked={allowLateJoin}
                disabled={savingLateJoin}
                onChange={(e) => void handleToggleLateJoin(e.target.checked)}
                inputProps={{ "aria-label": "Allow late joins" }}
              />
              <Box>
                <Typography variant="body2">Allow late joins</Typography>
                <Typography variant="caption" color="text.secondary">
                  Players can add themselves from the join link while the
                  tournament is running. They take a loss for rounds already
                  played and enter the next pairing.
                </Typography>
              </Box>
            </Box>

            {allowLateJoin && tournament.join_code && (
              <Box mt={1.5} pl={5}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Room code
                  </Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ letterSpacing: 2, fontFamily: "monospace" }}
                  >
                    {tournament.join_code}
                  </Typography>
                  <Tooltip title={copiedJoinLink ? "Copied!" : "Copy link"}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(`${window.location.origin}/join/c/${tournament.join_code}`)
                          .then(() => {
                            setCopiedJoinLink(true);
                            setTimeout(() => setCopiedJoinLink(false), 2000);
                            setCopyToast("Copied!");
                          })
                          .catch(() => setCopyToast("Couldn't copy. Please try again."));
                      }}
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<QrCode2Icon />}
                    onClick={() =>
                      window.open(wPath(`/tournaments/${tournament.id}/join-display`), "_blank")
                    }
                  >
                    Display join info
                  </Button>
                </Box>
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
            knownPlayers={knownPlayers}
            excludeUserIds={linkedUserIds}
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
          <Box display="flex" flexDirection="column" alignItems="flex-start" gap={1}>
            <Typography variant="body2" color="text.secondary">
              No players added yet.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => playerNameInputRef.current?.focus()}
            >
              Add your first player
            </Button>
          </Box>
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
                      {hasDecks && <TableCell>Deck</TableCell>}
                      {isManager && <TableCell>Account</TableCell>}
                      <TableCell>Static Seating</TableCell>
                      {tournament.status === "draft" && (
                        <TableCell align="right">Remove</TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPlayers.map((player) => {
                      const isSavingSeat = savingSeat === player.id;
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
                              {player.created_by === null && (
                                <Tooltip title="Self-registered via join link">
                                  <Chip label="Self-reg" size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 18 }} />
                                </Tooltip>
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
                          {hasDecks && (
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                {player.deck_pokemon1 != null && (
                                  <NormalizedSprite
                                    src={getSpriteUrl(player.deck_pokemon1)}
                                    size={28}
                                  />
                                )}
                                {player.deck_pokemon2 != null && (
                                  <NormalizedSprite
                                    src={getSpriteUrl(player.deck_pokemon2)}
                                    size={28}
                                  />
                                )}
                                {isManager ? (
                                  <Tooltip
                                    title={
                                      player.deck_pokemon1 != null || player.deck_pokemon2 != null
                                        ? "Edit deck"
                                        : "Set deck"
                                    }
                                  >
                                    <IconButton
                                      size="small"
                                      aria-label={`Set deck for ${player.name}`}
                                      onClick={() => setDeckPlayerId(player.id)}
                                    >
                                      <EditIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  player.deck_pokemon1 == null &&
                                  player.deck_pokemon2 == null && (
                                    <Typography variant="caption" color="text.secondary">
                                      —
                                    </Typography>
                                  )
                                )}
                              </Box>
                            </TableCell>
                          )}
                          {isManager && (
                            <TableCell>
                              {player.user_id ? (
                                <Tooltip title="Linked to a player account">
                                  <Chip
                                    icon={<HowToRegIcon />}
                                    label="Linked"
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                    sx={{ fontSize: "0.65rem", height: 22 }}
                                  />
                                </Tooltip>
                              ) : (
                                <Tooltip title={`Send ${player.name} a link to claim this entry`}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={<LinkIcon fontSize="inherit" />}
                                    aria-label={`Link account for ${player.name}`}
                                    onClick={() => setClaimPlayerId(player.id)}
                                  >
                                    Link
                                  </Button>
                                </Tooltip>
                              )}
                            </TableCell>
                          )}
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
            {tournament.round_duration_minutes && (
              <Typography variant="body2" color="text.secondary">
                Round timer: {tournament.round_duration_minutes} minutes per round.
              </Typography>
            )}
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
      <PlayerClaimLinkDialog
        open={claimPlayerId !== null}
        playerId={claimPlayerId}
        playerName={players.find((p) => p.id === claimPlayerId)?.name ?? "this player"}
        onClose={() => setClaimPlayerId(null)}
      />

      <DeckPickerDialog
        open={deckPlayerId !== null}
        onClose={() => setDeckPlayerId(null)}
        title={`Deck for ${players.find((p) => p.id === deckPlayerId)?.name ?? "player"}`}
        initialPokemon1={
          players.find((p) => p.id === deckPlayerId)?.deck_pokemon1 ?? null
        }
        initialPokemon2={
          players.find((p) => p.id === deckPlayerId)?.deck_pokemon2 ?? null
        }
        onSave={async (p1, p2) => {
          if (deckPlayerId) await handleSaveDeck(deckPlayerId, p1, p2);
        }}
      />
      <Snackbar
        open={copyToast !== null}
        autoHideDuration={2000}
        onClose={() => setCopyToast(null)}
        message={copyToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default TournamentView;
