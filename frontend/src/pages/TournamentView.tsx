import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
} from "@mui/icons-material";

interface Tournament {
  id: number;
  name: string;
  date: string;
  league_name?: string;
  is_completed: boolean;
  created_at: string;
}

interface Match {
  id: number;
  tournament_id: number;
  round_number: number;
  player1_id: number;
  player2_id: number;
  player1_name: string;
  player2_name: string;
  winner_id: number;
  winner_name: string;
  result: string;
  created_at: string;
}

const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchTournamentData();
    }
  }, [id]);

  const fetchTournamentData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tournament details
      const tournamentResponse = await fetch(
        `http://localhost:3002/api/tournaments/${id}`
      );
      if (!tournamentResponse.ok) {
        throw new Error("Tournament not found");
      }
      const tournamentData = await tournamentResponse.json();
      setTournament(tournamentData);

      // Fetch tournament matches
      const matchesResponse = await fetch(
        `http://localhost:3002/api/tournaments/${id}/matches`
      );
      if (matchesResponse.ok) {
        const matchesData = await matchesResponse.json();
        setMatches(matchesData);
      }
    } catch (error) {
      setError("Failed to load tournament data");
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

  const getResultColor = (result: string) => {
    switch (result) {
      case "WIN_P1":
        return "success";
      case "WIN_P2":
        return "success";
      case "DRAW":
        return "warning";
      case "BYE":
        return "info";
      default:
        return "default";
    }
  };

  const getResultLabel = (result: string) => {
    switch (result) {
      case "WIN_P1":
        return "Player 1 Wins";
      case "WIN_P2":
        return "Player 2 Wins";
      case "DRAW":
        return "Draw";
      case "BYE":
        return "Bye";
      default:
        return "Pending";
    }
  };

  // Group matches by round
  const matchesByRound = matches.reduce((acc, match) => {
    const round = match.round_number;
    if (!acc[round]) {
      acc[round] = [];
    }
    acc[round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  // Get all round numbers sorted
  const roundNumbers = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b);

  // Determine the active round (highest round number, but only if tournament is not completed)
  const activeRound =
    roundNumbers.length > 0 && !tournament?.is_completed
      ? Math.max(...roundNumbers)
      : null;

  // Set selected round to highest round on initial load (for both active and completed tournaments)
  useEffect(() => {
    if (roundNumbers.length > 0 && selectedRound === null) {
      setSelectedRound(Math.max(...roundNumbers));
    }
  }, [roundNumbers, selectedRound]);

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

  if (error || !tournament) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/tournaments")}
          sx={{ mb: 2 }}
        >
          Back to Tournaments
        </Button>
        <Alert severity="error">{error || "Tournament not found"}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/tournaments")}
        sx={{ mb: 2 }}
      >
        Back to Tournaments
      </Button>

      {/* Tournament Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <TournamentIcon color="primary" sx={{ mr: 2, fontSize: 40 }} />
          <Box>
            <Typography variant="h4" component="h1">
              {tournament.name}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {formatDate(tournament.date)}
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={1}>
                  <TrophyIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Status</Typography>
                </Box>
                <Chip
                  label={tournament.is_completed ? "Completed" : "Active"}
                  color={getCompletionColor(tournament.is_completed) as any}
                  size="medium"
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" mb={1}>
                  <PeopleIcon color="secondary" sx={{ mr: 1 }} />
                  <Typography variant="h6">League</Typography>
                </Box>
                <Typography variant="body1">
                  {tournament.league_name || "No League"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Created
                </Typography>
                <Typography variant="body1">
                  {formatDate(tournament.created_at)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Matches Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Matches ({matches.length}) - {roundNumbers.length} Rounds
        </Typography>

        {/* Round Summary */}
        {roundNumbers.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="primary">
                      {tournament?.is_completed
                        ? "Final Round"
                        : "Current Round"}
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {tournament?.is_completed
                        ? Math.max(...roundNumbers)
                        : activeRound}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tournament?.is_completed
                        ? "Tournament Completed"
                        : "Active Round"}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="secondary">
                      Total Rounds
                    </Typography>
                    <Typography variant="h4" color="secondary">
                      {roundNumbers.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tournament Structure
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="info.main">
                      Total Matches
                    </Typography>
                    <Typography variant="h4" color="info.main">
                      {matches.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Across All Rounds
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}

        {matches.length === 0 ? (
          <Alert severity="info">
            No matches have been created for this tournament yet.
          </Alert>
        ) : (
          <Box>
            {/* Round Navigation Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
              <Tabs
                value={selectedRound || activeRound}
                onChange={(_, newValue) => setSelectedRound(newValue)}
                variant="scrollable"
                scrollButtons="auto"
              >
                {roundNumbers.map((round) => (
                  <Tab
                    key={round}
                    label={
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <Typography variant="body2">Round {round}</Typography>
                        {round === activeRound && (
                          <Chip
                            label="Active"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    value={round}
                  />
                ))}
              </Tabs>
            </Box>

            {/* Matches for Selected Round */}
            {selectedRound && matchesByRound[selectedRound] && (
              <Box>
                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                  Round {selectedRound} - {matchesByRound[selectedRound].length}{" "}
                  matches
                </Typography>

                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Player 1</TableCell>
                        <TableCell>Player 2</TableCell>
                        <TableCell>Result</TableCell>
                        <TableCell>Winner</TableCell>
                        <TableCell>Date</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matchesByRound[selectedRound].map((match) => (
                        <TableRow key={match.id}>
                          <TableCell>{match.player1_name || "TBD"}</TableCell>
                          <TableCell>{match.player2_name || "TBD"}</TableCell>
                          <TableCell>
                            <Chip
                              label={getResultLabel(match.result)}
                              color={getResultColor(match.result) as any}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{match.winner_name || "N/A"}</TableCell>
                          <TableCell>{formatDate(match.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default TournamentView;
