import React, { useState, useEffect } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
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
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import { apiCall, handleApiError } from "../utils/api";
import { useAuth } from "../AuthContext";

interface Tournament {
  id: number;
  name: string;
  date: string;
  league_name?: string;
  bracket_type: string;
  status: "new" | "active" | "completed";
  created_at: string;
  updated_at?: string;
}

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchName, setSearchName] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [leagues, setLeagues] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetchTournaments();
    fetchLeagues();
  }, []);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const response = await apiCall("/api/tournaments");
      if (response.ok) {
        const data = await response.json();
        setTournaments(data);
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

  const fetchLeagues = async () => {
    try {
      const response = await apiCall("/api/leagues");
      if (response.ok) {
        const data = await response.json();
        setLeagues(data);
      }
    } catch (error) {
      // ignore league fetch errors for now
    }
  };

  const handleDeleteTournament = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this tournament? This cannot be undone."
      )
    )
      return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiCall(`/api/tournaments/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setTournaments((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Tournament deleted successfully.");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete tournament.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getCompletionColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "active":
        return "warning";
      case "new":
        return "info";
      default:
        return "default";
    }
  };

  const getBracketTypeLabel = (bracketType: string) => {
    switch (bracketType) {
      case "SWISS":
        return "Swiss System";
      case "SINGLE_ELIMINATION":
        return "Single Elimination";
      case "DOUBLE_ELIMINATION":
        return "Double Elimination";
      default:
        return bracketType;
    }
  };

  // Add a function to capitalize the status label
  const getStatusLabel = (status: string) => {
    if (!status) return "";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Filtering and sorting logic
  const filteredTournaments = tournaments
    .filter((t) =>
      searchName.trim() === ""
        ? true
        : t.name.toLowerCase().includes(searchName.toLowerCase())
    )
    .filter((t) =>
      selectedLeague === ""
        ? true
        : t.league_name ===
          leagues.find((l) => l.id.toString() === selectedLeague)?.name
    )
    .filter((t) =>
      selectedStatus === "all" ? true : t.status === selectedStatus
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

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
          component={RouterLink}
          to="/tournaments/create"
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
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="league-filter-label">League</InputLabel>
          <Select
            labelId="league-filter-label"
            value={selectedLeague}
            label="League"
            onChange={(e) => setSelectedLeague(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {leagues.map((league) => (
              <MenuItem key={league.id} value={league.id.toString()}>
                {league.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={selectedStatus}
            label="Status"
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="new">New</MenuItem>
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

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>League</TableCell>
                <TableCell>Bracket Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTournaments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No tournaments found. Create your first tournament!
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    <TableCell>{tournament.name}</TableCell>
                    <TableCell>{formatDate(tournament.date)}</TableCell>
                    <TableCell>
                      {tournament.league_name || "No League"}
                    </TableCell>
                    <TableCell>
                      {getBracketTypeLabel(tournament.bracket_type)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getStatusLabel(tournament.status)}
                        color={getCompletionColor(tournament.status) as any}
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
                          navigate(`/tournaments/${tournament.id}`)
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
                        {deletingId === tournament.id
                          ? "Deleting..."
                          : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default Tournaments;
