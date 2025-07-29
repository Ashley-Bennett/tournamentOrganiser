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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Autocomplete,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
  Add as AddIcon,
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

interface Player {
  id: number;
  name: string;
  static_seating: boolean;
  created_at: string;
}

interface TournamentPlayer {
  id: number;
  name: string;
  static_seating: boolean;
  dropped: boolean;
  started_round: number;
  created_at: string;
}

const TournamentView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournamentPlayers, setTournamentPlayers] = useState<
    TournamentPlayer[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [openCreateMatchDialog, setOpenCreateMatchDialog] = useState(false);
  const [openAddPlayerDialog, setOpenAddPlayerDialog] = useState(false);
  const [openCreatePlayerDialog, setOpenCreatePlayerDialog] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [createMatchForm, setCreateMatchForm] = useState({
    round_number: 1,
    player1_id: "",
    player2_id: "",
  });
  const [addPlayerForm, setAddPlayerForm] = useState({
    selectedPlayers: [] as Player[],
    started_round: 1,
  });
  const [createPlayerForm, setCreatePlayerForm] = useState({
    name: "",
    static_seating: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [creatingPlayer, setCreatingPlayer] = useState(false);

  useEffect(() => {
    if (id) {
      fetchTournamentData();
      fetchPlayers();
      fetchTournamentPlayers();
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

  const fetchPlayers = async () => {
    try {
      const response = await fetch("http://localhost:3002/api/players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data);
      }
    } catch (error) {
      console.error("Error fetching players:", error);
    }
  };

  const fetchTournamentPlayers = async () => {
    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/players`
      );
      if (response.ok) {
        const data = await response.json();
        setTournamentPlayers(data);
      }
    } catch (error) {
      console.error("Error fetching tournament players:", error);
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

  const handleCreateMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/matches`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            round_number: createMatchForm.round_number,
            player1_id: createMatchForm.player1_id
              ? parseInt(createMatchForm.player1_id)
              : null,
            player2_id: createMatchForm.player2_id
              ? parseInt(createMatchForm.player2_id)
              : null,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log("Match created:", result);
        setOpenCreateMatchDialog(false);
        setCreateMatchForm({
          round_number: 1,
          player1_id: "",
          player2_id: "",
        });
        fetchTournamentData(); // Refresh the tournament data
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create match");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPlayer = async (event: React.FormEvent) => {
    event.preventDefault();

    // Validate that at least one player is selected
    if (addPlayerForm.selectedPlayers.length === 0) {
      return; // Don't set error, just return - the field will show its own error state
    }

    setAddingPlayer(true);

    try {
      const response = await fetch(
        `http://localhost:3002/api/tournaments/${id}/players/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            players: addPlayerForm.selectedPlayers.map((player) => player.id),
            started_round: addPlayerForm.started_round,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log(
          "Players added to tournament successfully:",
          result.message
        );
        setOpenAddPlayerDialog(false);
        setAddPlayerForm({
          selectedPlayers: [],
          started_round: 1,
        });
        fetchTournamentPlayers(); // Refresh the tournament players
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to add players to tournament");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleCreatePlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingPlayer(true);

    try {
      const response = await fetch("http://localhost:3002/api/players", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPlayerForm),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Player created:", result);

        // Add the newly created player to the tournament
        const addToTournamentResponse = await fetch(
          `http://localhost:3002/api/tournaments/${id}/players`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              player_id: result.id,
              started_round: 1,
            }),
          }
        );

        if (addToTournamentResponse.ok) {
          console.log("Player automatically added to tournament");
          setSuccess("Player created and added to tournament successfully!");
          setError(null);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccess(null), 5000);
        } else {
          console.warn("Player created but could not be added to tournament");
          setSuccess(
            "Player created successfully! You can add them to the tournament manually."
          );
          setError(null);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccess(null), 5000);
        }

        setOpenCreatePlayerDialog(false);
        setCreatePlayerForm({ name: "", static_seating: false });
        fetchPlayers(); // Refresh the players list
        fetchTournamentPlayers(); // Refresh the tournament players
        setError(null); // Clear any previous errors
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create player");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setCreatingPlayer(false);
    }
  };

  const handleTextFieldChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setCreateMatchForm({
        ...createMatchForm,
        [field]: event.target.value,
      });
    };

  const handleSelectChange =
    (field: string) => (event: SelectChangeEvent<string>) => {
      setCreateMatchForm({
        ...createMatchForm,
        [field]: event.target.value,
      });
    };

  const handleAddPlayerTextFieldChange =
    (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setAddPlayerForm({
        ...addPlayerForm,
        [field]: event.target.value,
      });
    };

  const handleCreatePlayerChange =
    (field: string) =>
    (event: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
      const value =
        field === "static_seating"
          ? (event.target as HTMLInputElement).checked
          : event.target.value;
      setCreatePlayerForm({
        ...createPlayerForm,
        [field]: value,
      });
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
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
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

      {/* Tournament Players Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography variant="h5" gutterBottom>
            Players ({tournamentPlayers.length})
          </Typography>
          <Box display="flex" gap={2}>
            <Button
              variant="outlined"
              onClick={() => {
                setError(null); // Clear any previous errors
                setSuccess(null); // Clear any previous success messages
                setOpenCreatePlayerDialog(true);
              }}
              disabled={tournament?.is_completed}
            >
              Create New Player
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setError(null); // Clear any previous errors
                setSuccess(null); // Clear any previous success messages
                setOpenAddPlayerDialog(true);
              }}
              disabled={tournament?.is_completed}
            >
              Add Players
            </Button>
          </Box>
        </Box>

        {Boolean(tournament?.is_completed) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This tournament is completed. No new players can be added.
          </Alert>
        )}

        {tournamentPlayers.length === 0 ? (
          <Alert severity="info">
            {tournament?.is_completed
              ? "No players were added to this completed tournament."
              : "No players have been added to this tournament yet. Add players to get started!"}
          </Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Seating Type</TableCell>
                  <TableCell>Started Round</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Added</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tournamentPlayers.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          Boolean(player.static_seating) ? "Static" : "Dynamic"
                        }
                        color={
                          Boolean(player.static_seating) ? "primary" : "default"
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>Round {player.started_round}</TableCell>
                    <TableCell>
                      <Chip
                        label={Boolean(player.dropped) ? "Dropped" : "Active"}
                        color={Boolean(player.dropped) ? "error" : "success"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(player.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
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
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              No matches have been created for this tournament yet.
            </Alert>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenCreateMatchDialog(true)}
              sx={{ mb: 2 }}
              disabled={
                tournamentPlayers.length === 0 || tournament?.is_completed
              }
            >
              Create First Match
            </Button>
            {tournamentPlayers.length === 0 && (
              <Alert severity="warning">
                Add players to the tournament before creating matches.
              </Alert>
            )}
            {Boolean(tournament?.is_completed) && (
              <Alert severity="warning">
                This tournament is completed. No new matches can be created.
              </Alert>
            )}
          </Box>
        ) : (
          <Box>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6" gutterBottom>
                Round {selectedRound} -{" "}
                {selectedRound && matchesByRound[selectedRound]
                  ? matchesByRound[selectedRound].length
                  : 0}{" "}
                matches
              </Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setOpenCreateMatchDialog(true)}
                disabled={tournament?.is_completed}
              >
                Create Match
              </Button>
            </Box>

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

        {/* Add Player Dialog */}
        <Dialog
          open={openAddPlayerDialog && !tournament?.is_completed}
          onClose={() => setOpenAddPlayerDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Add Players to Tournament</DialogTitle>
          <form onSubmit={handleAddPlayer}>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Autocomplete
                    multiple
                    options={players.filter(
                      (player) =>
                        !tournamentPlayers.some((tp) => tp.id === player.id)
                    )}
                    getOptionLabel={(option) => option.name}
                    value={addPlayerForm.selectedPlayers}
                    onChange={(_, newValue) => {
                      setAddPlayerForm({
                        ...addPlayerForm,
                        selectedPlayers: newValue,
                      });
                      // Clear any previous errors when user makes a selection
                      if (newValue.length > 0) {
                        setError(null);
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Players"
                        placeholder="Search and select players..."
                        error={addPlayerForm.selectedPlayers.length === 0}
                        helperText={
                          addPlayerForm.selectedPlayers.length === 0
                            ? "Please select at least one player"
                            : `${
                                addPlayerForm.selectedPlayers.length
                              } selected, ${
                                players.filter(
                                  (player) =>
                                    !tournamentPlayers.some(
                                      (tp) => tp.id === player.id
                                    )
                                ).length
                              } available`
                        }
                      />
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          label={option.name}
                          {...getTagProps({ index })}
                          size="small"
                          color="primary"
                        />
                      ))
                    }
                    noOptionsText="No players available"
                    filterOptions={(options, { inputValue }) => {
                      const filtered = options.filter((option) =>
                        option.name
                          .toLowerCase()
                          .includes(inputValue.toLowerCase())
                      );
                      return filtered;
                    }}
                    renderOption={(props, option) => (
                      <li {...props}>
                        <Box display="flex" alignItems="center" width="100%">
                          <Typography variant="body1">{option.name}</Typography>
                          {Boolean(option.static_seating) && (
                            <Chip
                              label="Static"
                              size="small"
                              color="secondary"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Box>
                      </li>
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Started Round"
                    type="number"
                    value={addPlayerForm.started_round}
                    onChange={handleAddPlayerTextFieldChange("started_round")}
                    inputProps={{ min: 1 }}
                    required
                  />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setOpenAddPlayerDialog(false)}
                disabled={addingPlayer}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  addingPlayer || addPlayerForm.selectedPlayers.length === 0
                }
              >
                {addingPlayer
                  ? "Adding..."
                  : `Add ${addPlayerForm.selectedPlayers.length} Player${
                      addPlayerForm.selectedPlayers.length !== 1 ? "s" : ""
                    }`}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Create Player Dialog */}
        <Dialog
          open={openCreatePlayerDialog}
          onClose={() => setOpenCreatePlayerDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Create New Player</DialogTitle>
          <form onSubmit={handleCreatePlayer}>
            <DialogContent>
              <TextField
                fullWidth
                label="Player Name"
                value={createPlayerForm.name}
                onChange={handleCreatePlayerChange("name")}
                required
                variant="outlined"
                sx={{ mb: 2 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={createPlayerForm.static_seating}
                    onChange={handleCreatePlayerChange("static_seating")}
                  />
                }
                label="Static Seating (Player prefers fixed seating position)"
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setOpenCreatePlayerDialog(false)}
                disabled={creatingPlayer}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={creatingPlayer || !createPlayerForm.name.trim()}
              >
                {creatingPlayer ? "Creating..." : "Create Player"}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Create Match Dialog */}
        <Dialog
          open={openCreateMatchDialog && !tournament?.is_completed}
          onClose={() => setOpenCreateMatchDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Create New Match</DialogTitle>
          <form onSubmit={handleCreateMatch}>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Round Number"
                    type="number"
                    value={createMatchForm.round_number}
                    onChange={handleTextFieldChange("round_number")}
                    inputProps={{ min: 1 }}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Player 1 (Optional)</InputLabel>
                    <Select
                      value={createMatchForm.player1_id}
                      label="Player 1 (Optional)"
                      onChange={handleSelectChange("player1_id")}
                    >
                      <MenuItem value="">
                        <em>Select Player 1</em>
                      </MenuItem>
                      {tournamentPlayers
                        .filter((player) => !Boolean(player.dropped))
                        .map((player) => (
                          <MenuItem key={player.id} value={player.id}>
                            {player.name}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Player 2 (Optional)</InputLabel>
                    <Select
                      value={createMatchForm.player2_id}
                      label="Player 2 (Optional)"
                      onChange={handleSelectChange("player2_id")}
                    >
                      <MenuItem value="">
                        <em>Select Player 2</em>
                      </MenuItem>
                      {tournamentPlayers
                        .filter((player) => !Boolean(player.dropped))
                        .map((player) => (
                          <MenuItem key={player.id} value={player.id}>
                            {player.name}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setOpenCreateMatchDialog(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={submitting}>
                {submitting ? "Creating..." : "Create Match"}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Paper>
    </Box>
  );
};

export default TournamentView;
