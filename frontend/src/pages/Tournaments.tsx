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

interface Tournament {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  tournament_type: "swiss" | "single_elimination";
  created_at: string;
  created_by: string;
}

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { workspaceId, wPath } = useWorkspace();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const createNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const fetchTournaments = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) {
        logout();
        navigate("/login");
        return;
      }
      if (!workspaceId) return;

      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, status, tournament_type, created_at, created_by")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setTournaments(data || []);
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      setLoading(false);
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

  const handleCreateTournament = async () => {
    const name = newName.trim();
    if (!name) { setCreateError("Please enter a tournament name."); return; }
    if (!user || !workspaceId) return;
    setCreating(true);
    setCreateError("");
    const { data, error: insertError } = await supabase
      .from("tournaments")
      .insert({
        name,
        created_by: user.id,
        workspace_id: workspaceId,
        status: "draft",
        tournament_type: "swiss",
        is_public: false,
      })
      .select("id")
      .single();
    setCreating(false);
    if (insertError) { setCreateError(insertError.message); return; }
    setCreateOpen(false);
    setNewName("");
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

  // Format tournament type for display
  const getTournamentTypeLabel = (type: string) => {
    if (!type) return "";
    return type === "single_elimination" ? "Single Elimination" : "Swiss";
  };

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
      <Box
        display="flex"
        flexWrap="wrap"
        gap={2}
        mb={2}
        justifyContent="space-between"
        alignItems="center"
      >
        <Typography variant="h4" component="h1">
          Tournaments
        </Typography>
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
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
              No tournaments found. Create your first tournament!
            </Typography>
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
                    {getTournamentTypeLabel(tournament.tournament_type)} · {formatDate(tournament.created_at)}
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
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
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
                      <Typography variant="body2" color="text.secondary">
                        No tournaments found. Create your first tournament!
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTournaments.map((tournament) => (
                    <TableRow key={tournament.id}>
                      <TableCell>{tournament.name}</TableCell>
                      <TableCell>
                        {getTournamentTypeLabel(tournament.tournament_type)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(tournament.status)}
                          color={getCompletionColor(tournament.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(tournament.created_at)}</TableCell>
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
        onClose={() => { setCreateOpen(false); setNewName(""); setCreateError(""); }}
        fullWidth
        maxWidth="xs"
        TransitionProps={{ onEntered: () => createNameRef.current?.focus() }}
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
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateOpen(false); setNewName(""); setCreateError(""); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creating || !newName.trim()}
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
