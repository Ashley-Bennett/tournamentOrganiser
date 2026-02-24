import React, { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Alert,
  Chip,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import EditIcon from "@mui/icons-material/Edit";
import { apiCall, handleApiError } from "../utils/api";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import PageLoading from "../components/PageLoading";
import { formatDate } from "../utils/format";

interface Player {
  id: number;
  name: string;
  static_seating: boolean;
  trainer_id?: string;
  birth_year?: number;
  created_at: string;
  updated_at?: string;
}

const Players: React.FC = () => {
  const handleUnauthorized = useAuthRedirect();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    static_seating: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    static_seating: false,
    trainer_id: "",
    birth_year: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchPlayers = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await apiCall("/api/players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data);
      } else {
        if (handleUnauthorized(response)) return;
        await handleApiError(response);
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await apiCall("/api/players", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await response.json();
        setOpenDialog(false);
        setFormData({ name: "", static_seating: false });
        fetchPlayers(false); // Refresh without full-page loading
      } else {
        if (handleUnauthorized(response)) return;
        await handleApiError(response);
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
      const value =
        field === "static_seating"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setFormData({
        ...formData,
        [field]: value,
      });
    };

  const openEditDialog = (player: Player) => {
    setEditPlayer(player);
    setEditForm({
      name: player.name,
      static_seating: player.static_seating,
      trainer_id: player.trainer_id || "",
      birth_year: player.birth_year ? String(player.birth_year) : "",
    });
    setEditDialogOpen(true);
  };
  const handleEditChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
      const value =
        field === "static_seating"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setEditForm({ ...editForm, [field]: value });
    };
  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editPlayer) return;
    setEditSubmitting(true);
    setEditError(null);
    setSuccess(null);
    try {
      const payload = {
        name: editForm.name,
        static_seating: !!editForm.static_seating,
        trainer_id: editForm.trainer_id || null,
        birth_year: editForm.birth_year ? Number(editForm.birth_year) : null,
      };
      const response = await apiCall(`/api/players/${editPlayer.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setEditDialogOpen(false);
        setEditPlayer(null);
        setEditForm({
          name: "",
          static_seating: false,
          trainer_id: "",
          birth_year: "",
        });
        fetchPlayers(false);
        setSuccess("Player updated successfully.");
      } else {
        if (handleUnauthorized(response)) return;
        await handleApiError(response);
      }
    } catch (error: unknown) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Network error. Please try again.",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4" component="h1">
          Players
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Add Player
        </Button>
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

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Seating Type</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Trainer ID</TableCell>
                <TableCell>Birth Year</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No players found. Add your first player!
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={player.static_seating ? "Static" : "Dynamic"}
                        color={player.static_seating ? "primary" : "default"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(player.created_at)}</TableCell>
                    <TableCell>{player.trainer_id || "N/A"}</TableCell>
                    <TableCell>{player.birth_year || "N/A"}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => openEditDialog(player)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add Player Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Player</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Player Name"
              value={formData.name}
              onChange={handleChange("name")}
              required
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.static_seating}
                  onChange={handleChange("static_seating")}
                />
              }
              label="Static Seating (Player prefers fixed seating position)"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? "Adding..." : "Add Player"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Player</DialogTitle>
        <form onSubmit={handleEditSubmit}>
          <DialogContent>
            <TextField
              fullWidth
              label="Player Name"
              value={editForm.name}
              onChange={handleEditChange("name")}
              required
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={editForm.static_seating}
                  onChange={handleEditChange("static_seating")}
                />
              }
              label="Static Seating (Player prefers fixed seating position)"
            />
            <TextField
              label="Trainer ID (optional)"
              value={editForm.trainer_id}
              onChange={handleEditChange("trainer_id")}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Birth Year (optional)"
              value={editForm.birth_year}
              onChange={handleEditChange("birth_year")}
              type="number"
              fullWidth
              margin="normal"
            />
            {editError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {editError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setEditDialogOpen(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={editSubmitting}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default Players;
