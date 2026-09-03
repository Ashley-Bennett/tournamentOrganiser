import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Typography,
  Button,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  ChipProps,
  Alert,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Skeleton,
  Card,
  CardContent,
  CardActions,
  IconButton,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { formatDate } from "../utils/format";
import { Add as AddIcon } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";
import { TournamentSummary, toTournamentSummary } from "../types/tournament";
import GamePicker from "../components/GamePicker";
import {
  formatLabel,
  getGame,
  getGameFormat,
  isStructureImplemented,
  structureLabel,
} from "../games/registry";
import Breadcrumbs from "../components/Breadcrumbs";

const Tournaments: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { workspaceId, wPath } = useWorkspace();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDoneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(
    (location.state as { filterStatus?: string } | null)?.filterStatus ?? "all",
  );

  // ── Create tournament dialog ─────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(
    !!(location.state as { openCreate?: boolean } | null)?.openCreate,
  );
  const [newName, setNewName] = useState("");
  const [newGameId, setNewGameId] = useState<string | null>(null);
  const [newFormat, setNewFormat] = useState("");
  const [newStructure, setNewStructure] = useState("swiss");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const createNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  // Header "Create Tournament" button navigates to this page with openCreate state,
  // even when already here. useState only runs once so we need an effect to respond.
  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      setCreateError("");
      setCreateOpen(true);
    }
  }, [location.state]);

  const fetchTournaments = useCallback(async () => {
    const isInitialLoad = !initialLoadDoneRef.current;
    try {
      if (isInitialLoad) setLoading(true);
      if (!user) {
        logout();
        navigate("/login");
        return;
      }
      if (!workspaceId) return;

      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, status, tournament_type, created_at, created_by, starts_at, game_format, game_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setTournaments((data || []).map(toTournamentSummary));
      initialLoadDoneRef.current = true;
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [user, logout, navigate, workspaceId]);

  useEffect(() => {
    if (!user || !workspaceId) return;
    void fetchTournaments();
  }, [user, workspaceId, fetchTournaments]);

  const handleDeleteTournament = (id: string) => {
    const t = tournaments.find((t) => t.id === id);
    if (t) {
      setPendingDelete({ id: t.id, name: t.name });
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDeleteTournament = async () => {
    const id = pendingDelete?.id;
    if (!id) return;
    setDeleteDialogOpen(false);
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase
        .from("tournaments")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId ?? "");

      if (error) {
        throw new Error(error.message || "Failed to delete tournament.");
      }

      setTournaments((prev) => prev.filter((t) => t.id !== id));
      setSuccess("Tournament deleted successfully.");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const resetCreateForm = () => {
    setCreateOpen(false);
    setNewName("");
    setNewGameId(null);
    setNewFormat("");
    setNewStructure("swiss");
    setCreateError("");
  };

  /** Picking a game resets the steps below it to that game's defaults. */
  const handlePickGame = (gameId: string) => {
    const game = getGame(gameId);
    setNewGameId(game.id);
    setNewFormat(game.defaults.format ?? "");
    setNewStructure(game.defaults.structure);
    setCreateError("");
  };

  const handleCreateTournament = async () => {
    const name = newName.trim();
    if (!name) { setCreateError("Please enter a tournament name."); return; }
    if (!newGameId) { setCreateError("Please choose a game."); return; }
    if (!user || !workspaceId) return;
    const game = getGame(newGameId);
    setCreating(true);
    setCreateError("");
    const { data, error: insertError } = await supabase
      .from("tournaments")
      .insert({
        name,
        created_by: user.id,
        workspace_id: workspaceId,
        status: "draft",
        game_id: game.id,
        // A game with no formats stores nothing rather than an empty string.
        game_format: game.formats.length > 0 ? newFormat || null : null,
        tournament_type: newStructure,
        is_public: false,
      })
      .select("id")
      .single();
    setCreating(false);
    if (insertError) { setCreateError(insertError.message); return; }
    resetCreateForm();
    navigate(wPath(`/tournaments/${data.id}`), { state: { new: true } });
  };

  const getCompletionColor = (status: string): ChipProps["color"] => {
    switch (status) {
      case "completed":
        return "success";
      case "active":
        return "warning";
      case "draft":
        return "info";
      default:
        return "default";
    }
  };

  // Add a function to capitalize the status label
  const getStatusLabel = (status: string) => {
    if (!status) return "";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // What to show under a tournament's name: the format if one was chosen,
  // otherwise how it is run. Formats are stored as codes, so they go through
  // the registry rather than being printed raw.
  const getSubtitle = (t: TournamentSummary) =>
    formatLabel(t.game_id, t.game_format) ?? structureLabel(t.tournament_type);

  // Filtering and sorting logic
  const filteredTournaments = tournaments
    .filter((t) =>
      searchName.trim() === ""
        ? true
        : t.name.toLowerCase().includes(searchName.toLowerCase()),
    )
    .filter((t) =>
      selectedStatus === "all" ? true : t.status === selectedStatus,
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <Box>
      {!embedded && (
        <Breadcrumbs
          items={[
            { label: "Dashboard", to: "/dashboard" },
            { label: "Tournaments" },
          ]}
        />
      )}
      <Box
        display="flex"
        flexWrap="wrap"
        gap={2}
        mb={2}
        justifyContent="space-between"
        alignItems="center"
      >
        {!embedded && (
          <Typography variant="h4" component="h1">
            Tournaments
          </Typography>
        )}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => { setCreateError(""); setCreateOpen(true); }}
        >
          Create Tournament
        </Button>
      </Box>
      <Box display="flex" flexWrap="wrap" gap={2} mb={2}>
        <TextField
          label="Search Name"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          size="small"
          sx={{ minWidth: { xs: "100%", sm: 200 } }}
        />
        <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={selectedStatus}
            label="Status"
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {isMobile ? (
        /* ── Mobile card list ─────────────────────────────────── */
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} variant="outlined">
                <CardContent>
                  <Skeleton variant="text" width="60%" height={28} />
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rounded" width={60} height={22} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            ))
          ) : filteredTournaments.length === 0 ? (
            <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={4}>
              <Typography variant="body2" color="text.secondary">
                No tournaments found.
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setCreateOpen(true)}
              >
                Create your first tournament
              </Button>
            </Box>
          ) : (
            filteredTournaments.map((tournament) => (
              <Card key={tournament.id} variant="outlined">
                <CardContent sx={{ pb: 0 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ flex: 1, mr: 1 }}>
                      {tournament.name}
                    </Typography>
                    <Chip
                      label={getStatusLabel(tournament.status)}
                      color={getCompletionColor(tournament.status)}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {getGame(tournament.game_id).shortName} · {getSubtitle(tournament)} · {formatDate(tournament.starts_at ?? tournament.created_at)}
                  </Typography>
                </CardContent>
                <CardActions sx={{ pt: 0.5, px: 2, pb: 1.5 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => navigate(wPath(`/tournaments/${tournament.id}`))}
                    sx={{ flex: 1 }}
                  >
                    View
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteTournament(tournament.id)}
                    disabled={deletingId === tournament.id}
                    aria-label="Delete tournament"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            ))
          )}
        </Box>
      ) : (
        /* ── Desktop table ────────────────────────────────────── */
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Format</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton variant="text" width="60%" /></TableCell>
                      <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                      <TableCell><Skeleton variant="rounded" width={60} height={22} /></TableCell>
                      <TableCell><Skeleton variant="text" width="70%" /></TableCell>
                      <TableCell><Skeleton variant="text" width={80} /></TableCell>
                    </TableRow>
                  ))
                ) : filteredTournaments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={2}>
                        <Typography variant="body2" color="text.secondary">
                          No tournaments found.
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => setCreateOpen(true)}
                        >
                          Create your first tournament
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTournaments.map((tournament) => (
                    <TableRow key={tournament.id}>
                      <TableCell>{tournament.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={getGame(tournament.game_id).shortName}
                          size="small"
                          variant="outlined"
                          sx={{ mr: 1, height: 20, fontSize: 11 }}
                        />
                        {getSubtitle(tournament)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(tournament.status)}
                          color={getCompletionColor(tournament.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(tournament.starts_at ?? tournament.created_at)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          onClick={() =>
                            navigate(wPath(`/tournaments/${tournament.id}`))
                          }
                          sx={{ mr: 1 }}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDeleteTournament(tournament.id)}
                          disabled={deletingId === tournament.id}
                        >
                          {deletingId === tournament.id ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog
        open={createOpen}
        onClose={resetCreateForm}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create tournament</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <TextField
            inputRef={createNameRef}
            label="Tournament name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateTournament(); }}
            fullWidth
            required
            autoComplete="off"
            autoFocus
            sx={{ mt: 1, mb: 2 }}
          />

          <GamePicker value={newGameId} onChange={handlePickGame} />

          {/*
            Format and structure are revealed only once a game is chosen, and
            the format step is skipped entirely by games that have no formats —
            so a generic Swiss event is still a two-step create.
          */}
          {newGameId && (
            <Box display="flex" flexWrap="wrap" gap={2} mt={2.5}>
              {getGame(newGameId).formats.length > 0 && (
                <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 200 }, flex: 1 }}>
                  <InputLabel id="create-format-label">Format</InputLabel>
                  <Select
                    labelId="create-format-label"
                    label="Format"
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    // The hint belongs in the open list, not in the field —
                    // without this the closed Select reads "Standard Current rotation".
                    renderValue={(v) => getGameFormat(newGameId, v as string)?.name ?? String(v)}
                  >
                    {getGame(newGameId).formats.map((f) => (
                      <MenuItem key={f.id} value={f.id}>
                        {f.name}
                        {f.hint && (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            {f.hint}
                          </Typography>
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 200 }, flex: 1 }}>
                <InputLabel id="create-structure-label">Structure</InputLabel>
                <Select
                  labelId="create-structure-label"
                  label="Structure"
                  value={newStructure}
                  onChange={(e) => setNewStructure(e.target.value)}
                >
                  {getGame(newGameId).structures.map((st) => (
                    <MenuItem key={st} value={st} disabled={!isStructureImplemented(st)}>
                      {structureLabel(st)}
                      {!isStructureImplemented(st) && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          coming soon
                        </Typography>
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={resetCreateForm}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creating || !newName.trim() || !newGameId}
            onClick={() => void handleCreateTournament()}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        TransitionProps={{ onExited: () => setPendingDelete(null) }}
      >
        <DialogTitle>Delete tournament?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingDelete
              ? `Delete "${pendingDelete.name}"? This cannot be undone.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => void handleConfirmDeleteTournament()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Tournaments;
