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
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

interface Tournament {
  id: number;
  name: string;
  date: string;
  league_name?: string;
  is_completed: boolean;
  created_at: string;
}

const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:3002/api/tournaments");
      if (response.ok) {
        const data = await response.json();
        setTournaments(data);
      } else {
        setError("Failed to fetch tournaments");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getCompletionColor = (isCompleted: boolean) => {
    return isCompleted ? "success" : "warning";
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
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
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tournaments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No tournaments found. Create your first tournament!
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    <TableCell>{tournament.name}</TableCell>
                    <TableCell>{formatDate(tournament.date)}</TableCell>
                    <TableCell>
                      {tournament.league_name || "No League"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={tournament.is_completed ? "Completed" : "Active"}
                        color={
                          getCompletionColor(tournament.is_completed) as any
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(tournament.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        color="primary"
                        onClick={() =>
                          navigate(`/tournaments/${tournament.id}`)
                        }
                      >
                        View
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
