import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import EditIcon from "@mui/icons-material/Edit";
import { apiCall, handleApiError } from "../utils/api";
import { useAuth } from "../AuthContext";

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
  const navigate = useNavigate();
  const { logout } = useAuth();
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

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const response = await apiCall("/api/players");
      if (response.ok) {
        const data = await response.json();
        console.log("🔍 Players data received:", data);
        console.log("🔍 Players data type:", typeof data);
        console.log(
          "🔍 Players data length:",
          Array.isArray(data) ? data.length : "Not an array"
        );
        if (Array.isArray(data) && data.length > 0) {
          console.log("🔍 First player:", data[0]);
          console.log("🔍 First player name:", data[0].name);
        }
        setPlayers(data);
      } else {
        if (response.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        await handleApiError(response);
      }
    } catch (error: any) {
      setError(error.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        fetchPlayers(); // Refresh the list
      } else {
        if (response.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        await handleApiError(response);
      }
    } catch (error: any) {
      setError(error.message || "Network error. Please try again.");
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
    console.log("🔍 Opening edit dialog for player:", player);
    console.log("🔍 Player name in edit:", player.name);
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
      const payload: any = {
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
        fetchPlayers();
        setSuccess("Player updated successfully.");
      } else {
        if (response.status === 401) {
          logout();
          navigate("/login");
          return;
        }
        await handleApiError(response);
      }
    } catch (error: any) {
      setEditError(error.message || "Network error. Please try again.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
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
                players.map((player) => {
                  console.log("🔍 Rendering player:", player);
                  console.log("🔍 Player name:", player.name);
                  return (
                    <TableRow key={player.id}>
                      <TableCell>{player.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={
                            Boolean(player.static_seating)
                              ? "Static"
                              : "Dynamic"
                          }
                          color={
                            Boolean(player.static_seating)
                              ? "primary"
                              : "default"
                          }
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
                  );
                })
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
