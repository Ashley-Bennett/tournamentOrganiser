import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  InputAdornment,
  OutlinedInput,
  InputLabel,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import {
  generateSwissPairings,
  calculateMatchPoints,
  type Pairing,
  type PlayerStanding,
} from "../utils/tournamentPairing";

interface TournamentSummary {
  id: string;
  name: string;
  status: string;
  tournament_type: string;
  num_rounds: number | null;
  created_at: string;
  created_by: string;
}

interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  status: "ready" | "pending" | "completed" | "bye";
  created_at: string;
}

interface MatchWithPlayers extends Match {
  player1_name: string;
  player2_name: string | null;
  winner_name: string | null;
}

const TournamentMatches: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState(1);
  const [sortBy, setSortBy] = useState<"match" | "status">("match");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [processingRound, setProcessingRound] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithPlayers | null>(
    null,
  );
  const [selectedWinner, setSelectedWinner] = useState<string>("");
  const [player1Wins, setPlayer1Wins] = useState<number>(0);
  const [player2Wins, setPlayer2Wins] = useState<number>(0);
  const [updatingMatch, setUpdatingMatch] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Missing tournament id");
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    const fetchTournament = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, tournament_type, num_rounds, created_at, created_by",
          )
          .eq("id", id)
          .eq("created_by", user.id)
          .maybeSingle();

        if (error) {
          throw new Error(error.message || "Failed to load tournament");
        }
        if (!data) {
          setError("Tournament not found");
          setTournament(null);
        } else {
          setTournament(data as TournamentSummary);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load tournament");
        setTournament(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchTournament();
  }, [id, user, authLoading, navigate]);

  useEffect(() => {
    if (!tournament?.id || !user) return;

    const fetchMatches = async () => {
      try {
        setMatchesLoading(true);
        setError(null);

        // Fetch matches - stable order so match numbers never change
        const { data: matchesData, error: matchesError } = await supabase
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", tournament.id)
          .order("round_number", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (matchesError) {
          throw new Error(matchesError.message || "Failed to load matches");
        }

        if (!matchesData || matchesData.length === 0) {
          setMatches([]);
          setMatchesLoading(false);
          return;
        }

        // Fetch player names
        const playerIds = new Set<string>();
        matchesData.forEach((match) => {
          playerIds.add(match.player1_id);
          if (match.player2_id) {
            playerIds.add(match.player2_id);
          }
          if (match.winner_id) {
            playerIds.add(match.winner_id);
          }
        });

        const { data: playersData, error: playersError } = await supabase
          .from("tournament_players")
          .select("id, name")
          .in("id", Array.from(playerIds));

        if (playersError) {
          throw new Error(playersError.message || "Failed to load players");
        }

        const playersMap = new Map<string, string>();
        playersData?.forEach((player) => {
          playersMap.set(player.id, player.name);
        });

        // Combine matches with player names
        const matchesWithPlayers: MatchWithPlayers[] = matchesData.map(
          (match) => ({
            ...match,
            player1_name: playersMap.get(match.player1_id) || "Unknown",
            player2_name: match.player2_id
              ? playersMap.get(match.player2_id) || "Unknown"
              : null,
            winner_name: match.winner_id
              ? playersMap.get(match.winner_id) || "Unknown"
              : null,
          }),
        );

        setMatches(matchesWithPlayers);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load matches");
      } finally {
        setMatchesLoading(false);
      }
    };

    void fetchMatches();
  }, [tournament?.id, user]);

  const handleOpenScoreDialog = (
    match: MatchWithPlayers,
    winnerId: string | null = null,
  ) => {
    setSelectedMatch(match);
    // Pre-select winner if provided, otherwise check existing winner
    if (winnerId) {
      if (winnerId === match.player1_id) {
        setSelectedWinner("player1");
      } else if (winnerId === match.player2_id) {
        setSelectedWinner("player2");
      } else {
        setSelectedWinner("");
      }
    } else if (match.winner_id) {
      if (match.winner_id === match.player1_id) {
        setSelectedWinner("player1");
      } else if (match.winner_id === match.player2_id) {
        setSelectedWinner("player2");
      } else {
        setSelectedWinner("");
      }
    } else {
      setSelectedWinner("");
    }

    // Parse existing score if available (format: "2-0", "2-1", etc.)
    if (match.result && match.result !== "bye" && match.result !== "Draw") {
      const parts = match.result.split("-");
      if (parts.length === 2) {
        setPlayer1Wins(parseInt(parts[0], 10) || 0);
        setPlayer2Wins(parseInt(parts[1], 10) || 0);
      } else {
        setPlayer1Wins(0);
        setPlayer2Wins(0);
      }
    } else {
      setPlayer1Wins(0);
      setPlayer2Wins(0);
    }

    setScoreDialogOpen(true);
  };

  const handleCloseScoreDialog = () => {
    setScoreDialogOpen(false);
    setSelectedMatch(null);
    setSelectedWinner("");
    setPlayer1Wins(0);
    setPlayer2Wins(0);
  };

  const getScoreValidationError = (): string | null => {
    if (!selectedMatch || !selectedWinner) return null;

    // Validate score for non-draw matches
    if (selectedWinner !== "draw" && selectedMatch.player2_id) {
      if (player1Wins === 0 && player2Wins === 0) {
        return "Please enter a valid score";
      }
      // Ensure winner has more wins
      if (
        (selectedWinner === "player1" && player1Wins <= player2Wins) ||
        (selectedWinner === "player2" && player2Wins <= player1Wins)
      ) {
        return "Winner must have more wins than opponent";
      }
    }

    return null;
  };

  const handleSaveMatchResult = async () => {
    if (!selectedMatch || !selectedWinner) return;

    const validationError = getScoreValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setUpdatingMatch(true);
      setError(null);

      // Determine winner_id based on selection
      let winnerId: string | null = null;
      if (selectedWinner === "player1") {
        winnerId = selectedMatch.player1_id;
      } else if (selectedWinner === "player2" && selectedMatch.player2_id) {
        winnerId = selectedMatch.player2_id;
      } else if (selectedWinner === "draw") {
        // For draws, winner_id stays null
        winnerId = null;
      }

      // Generate score string
      let resultString = "";
      if (selectedWinner === "draw") {
        resultString = "Draw";
      } else if (selectedMatch.player2_id) {
        resultString = `${player1Wins}-${player2Wins}`;
      } else {
        resultString = "Bye";
      }

      // Update match in database
      const updateData: {
        winner_id?: string | null;
        result: string;
        status: "completed" | "pending";
      } = {
        result: resultString,
        status: selectedWinner === "draw" || winnerId ? "completed" : "pending",
      };

      if (winnerId !== undefined) {
        updateData.winner_id = winnerId;
      }

      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update(updateData)
        .eq("id", selectedMatch.id);

      if (updateError) {
        throw new Error(updateError.message || "Failed to update match");
      }

      // Refresh matches - same stable order so match numbers stay fixed
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament!.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const playerIds = new Set<string>();
      matchesData?.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          playerIds.add(match.winner_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: playersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? playersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? playersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
      handleCloseScoreDialog();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update match");
    } finally {
      setUpdatingMatch(false);
    }
  };

  const handleBeginRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      // Update all "ready" matches in current round to "pending"
      const { error: updateError } = await supabase
        .from("tournament_matches")
        .update({ status: "pending" })
        .eq("tournament_id", tournament.id)
        .eq("round_number", selectedRound)
        .eq("status", "ready");

      if (updateError) {
        throw new Error(updateError.message || "Failed to begin round");
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const playerIds = new Set<string>();
      matchesData?.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          playerIds.add(match.winner_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: playersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? playersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? playersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to begin round");
    } finally {
      setProcessingRound(false);
    }
  };

  const handleNextRound = async () => {
    if (!tournament || !user) return;

    try {
      setProcessingRound(true);
      setError(null);

      const nextRoundNumber = selectedRound + 1;
      if (tournament.num_rounds && nextRoundNumber > tournament.num_rounds) {
        throw new Error("Maximum number of rounds reached");
      }

      // Calculate standings from all previous rounds
      const allPreviousMatches = matches.filter(
        (m) => m.round_number < nextRoundNumber,
      );

      // Get all players
      const playerIds = new Set<string>();
      matches.forEach((match) => {
        playerIds.add(match.player1_id);
        if (match.player2_id) {
          playerIds.add(match.player2_id);
        }
      });

      const { data: playersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(playerIds));

      const playersMap = new Map<string, string>();
      playersData?.forEach((player) => {
        playersMap.set(player.id, player.name);
      });

      // Calculate standings
      const standingsMap = new Map<string, PlayerStanding>();
      playersData?.forEach((player) => {
        standingsMap.set(player.id, {
          id: player.id,
          name: player.name,
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      });

      // Process matches to calculate standings
      allPreviousMatches.forEach((match) => {
        const player1 = standingsMap.get(match.player1_id);
        const player2 = match.player2_id
          ? standingsMap.get(match.player2_id)
          : null;

        if (player1) {
          player1.matchesPlayed++;
          if (match.status === "bye" || !match.player2_id) {
            player1.byesReceived++;
          }
          if (match.status === "bye" || match.winner_id === match.player1_id) {
            player1.wins++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
            if (match.player2_id) {
              player1.opponents.push(match.player2_id);
            }
          } else if (match.winner_id === null && match.result === "Draw") {
            player1.draws++;
            player1.matchPoints = calculateMatchPoints(
              player1.wins,
              player1.draws,
            );
            if (match.player2_id) {
              player1.opponents.push(match.player2_id);
            }
          } else if (match.winner_id && match.winner_id !== match.player1_id) {
            player1.losses++;
            if (match.player2_id) {
              player1.opponents.push(match.player2_id);
            }
          }
        }

        if (player2) {
          player2.matchesPlayed++;
          if (match.winner_id === match.player2_id) {
            player2.wins++;
            player2.matchPoints = calculateMatchPoints(
              player2.wins,
              player2.draws,
            );
            player2.opponents.push(match.player1_id);
          } else if (match.winner_id === null && match.result === "Draw") {
            player2.draws++;
            player2.matchPoints = calculateMatchPoints(
              player2.wins,
              player2.draws,
            );
            player2.opponents.push(match.player1_id);
          } else if (match.winner_id !== match.player2_id) {
            player2.losses++;
            player2.opponents.push(match.player1_id);
          }
        }
      });

      const standings = Array.from(standingsMap.values());

      // Get previous pairings to avoid rematches
      const previousPairings: Pairing[] = allPreviousMatches.map((match) => ({
        player1Id: match.player1_id,
        player1Name: match.player1_name,
        player2Id: match.player2_id,
        player2Name: match.player2_name,
        roundNumber: match.round_number,
      }));

      // Generate pairings for next round
      const pairings = generateSwissPairings(
        standings,
        nextRoundNumber,
        previousPairings,
      );

      // Create matches in database
      const matchesToInsert = pairings.map((pairing) => ({
        tournament_id: tournament.id,
        round_number: nextRoundNumber,
        player1_id: pairing.player1Id,
        player2_id: pairing.player2Id,
        status: pairing.player2Id === null ? "bye" : "ready",
        result: pairing.player2Id === null ? "bye" : null,
        winner_id: pairing.player2Id === null ? pairing.player1Id : null,
      }));

      const { error: insertError } = await supabase
        .from("tournament_matches")
        .insert(matchesToInsert);

      if (insertError) {
        throw new Error(insertError.message || "Failed to create next round");
      }

      // Refresh matches
      const { data: matchesData, error: matchesError } = await supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournament.id)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (matchesError) {
        throw new Error(matchesError.message || "Failed to refresh matches");
      }

      // Fetch updated player names
      const allPlayerIds = new Set<string>();
      matchesData?.forEach((match) => {
        allPlayerIds.add(match.player1_id);
        if (match.player2_id) {
          allPlayerIds.add(match.player2_id);
        }
        if (match.winner_id) {
          allPlayerIds.add(match.winner_id);
        }
      });

      const { data: allPlayersData } = await supabase
        .from("tournament_players")
        .select("id, name")
        .in("id", Array.from(allPlayerIds));

      const allPlayersMap = new Map<string, string>();
      allPlayersData?.forEach((player) => {
        allPlayersMap.set(player.id, player.name);
      });

      const matchesWithPlayers: MatchWithPlayers[] = (matchesData || []).map(
        (match) => ({
          ...match,
          player1_name: allPlayersMap.get(match.player1_id) || "Unknown",
          player2_name: match.player2_id
            ? allPlayersMap.get(match.player2_id) || "Unknown"
            : null,
          winner_name: match.winner_id
            ? allPlayersMap.get(match.winner_id) || "Unknown"
            : null,
        }),
      );

      setMatches(matchesWithPlayers);
      setSelectedRound(nextRoundNumber);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to generate next round",
      );
    } finally {
      setProcessingRound(false);
    }
  };

  if (authLoading || loading || matchesLoading) {
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
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(`/tournaments/${id}`)}
            sx={{ mr: 2 }}
          >
            Back to tournament
          </Button>
          <Typography variant="h4" component="h1">
            Matches
          </Typography>
        </Box>
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
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/tournaments/${tournament.id}`)}
          sx={{ mr: 2 }}
        >
          Back to tournament
        </Button>
        <Typography variant="h4" component="h1">
          {tournament.name} - Matches
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {matches.length === 0 && !tournament.num_rounds ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            No Matches Yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Matches will appear here once the tournament has been started and
            round 1 pairings have been generated.
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          {(() => {
            const totalRounds = tournament.num_rounds ?? 1;
            const roundNumbers = Array.from(
              { length: totalRounds },
              (_, i) => i + 1,
            );

            return (
              <>
                <Tabs
                  value={Math.min(selectedRound, totalRounds)}
                  onChange={(_, value: number) => setSelectedRound(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{
                    borderBottom: 1,
                    borderColor: "divider",
                    "& .MuiTab-root": { minHeight: 48 },
                    "& .Mui-disabled": { opacity: 0.5 },
                  }}
                >
                  {roundNumbers.map((roundNumber) => {
                    const roundMatches = matches.filter(
                      (m) => m.round_number === roundNumber,
                    );
                    const hasMatches = roundMatches.length > 0;
                    return (
                      <Tab
                        key={roundNumber}
                        label={`Round ${roundNumber}`}
                        value={roundNumber}
                        disabled={!hasMatches}
                        sx={
                          hasMatches
                            ? {}
                            : {
                                color: "text.secondary",
                                fontWeight: 500,
                              }
                        }
                      />
                    );
                  })}
                </Tabs>
                <Box sx={{ p: 3 }}>
                  {(() => {
                    // Stable order by id so match numbers are absolute and never change
                    const baseMatches = matches
                      .filter((m) => m.round_number === selectedRound)
                      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

                    // Check round state for button display
                    const roundMatchesForState = matches.filter(
                      (m) => m.round_number === selectedRound,
                    );
                    const hasReadyMatches = roundMatchesForState.some(
                      (m) => m.status === "ready",
                    );
                    const hasPendingMatches = roundMatchesForState.some(
                      (m) => m.status === "pending",
                    );
                    const allCompleted =
                      roundMatchesForState.length > 0 &&
                      roundMatchesForState.every(
                        (m) => m.status === "completed" || m.status === "bye",
                      );
                    const canShowNextRound =
                      tournament.num_rounds &&
                      selectedRound < tournament.num_rounds;
                    const canProceedToNextRound =
                      allCompleted && canShowNextRound;
                    const showBeginRound =
                      hasReadyMatches && !hasPendingMatches;

                    // Map match id -> absolute match number (1-based, by id order)
                    const matchNumberById = new Map<string, number>();
                    baseMatches.forEach((m, i) =>
                      matchNumberById.set(m.id, i + 1),
                    );

                    // Apply sort by Match # or Status
                    const roundMatches = [...baseMatches].sort((a, b) => {
                      if (sortBy === "match") {
                        const cmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
                        return sortOrder === "asc" ? cmp : -cmp;
                      }
                      // sortBy === "status"
                      const statusOrder = {
                        ready: 0,
                        pending: 1,
                        completed: 2,
                        bye: 3,
                      };
                      const aVal = statusOrder[a.status] ?? 0;
                      const bVal = statusOrder[b.status] ?? 0;
                      const cmp = aVal - bVal;
                      return sortOrder === "asc" ? cmp : -cmp;
                    });

                    const hasMatches = roundMatches.length > 0;

                    const handleSort = (column: "match" | "status") => {
                      setSortBy(column);
                      setSortOrder((prev) =>
                        sortBy === column
                          ? prev === "asc"
                            ? "desc"
                            : "asc"
                          : "asc",
                      );
                    };

                    return hasMatches ? (
                      <Box>
                        {(showBeginRound || canShowNextRound) && (
                          <Box
                            sx={{
                              mb: 2,
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 1,
                            }}
                          >
                            {showBeginRound && (
                              <Button
                                variant="contained"
                                color="primary"
                                startIcon={<PlayArrowIcon />}
                                onClick={handleBeginRound}
                                disabled={processingRound}
                              >
                                Begin Round
                              </Button>
                            )}
                            {canShowNextRound && (
                              <Tooltip
                                title={
                                  !canProceedToNextRound
                                    ? "Complete all matches in this round to proceed to the next round"
                                    : ""
                                }
                                arrow
                              >
                                <span>
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<ArrowForwardIcon />}
                                    onClick={handleNextRound}
                                    disabled={
                                      processingRound || !canProceedToNextRound
                                    }
                                  >
                                    Next Round
                                  </Button>
                                </span>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                        <TableContainer>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell
                                  sortDirection={
                                    sortBy === "match" ? sortOrder : false
                                  }
                                >
                                  <TableSortLabel
                                    active={sortBy === "match"}
                                    direction={
                                      sortBy === "match" ? sortOrder : "asc"
                                    }
                                    onClick={() => handleSort("match")}
                                  >
                                    Match #
                                  </TableSortLabel>
                                </TableCell>
                                <TableCell>Player 1</TableCell>
                                <TableCell>Player 2</TableCell>
                                <TableCell
                                  sortDirection={
                                    sortBy === "status" ? sortOrder : false
                                  }
                                >
                                  <TableSortLabel
                                    active={sortBy === "status"}
                                    direction={
                                      sortBy === "status" ? sortOrder : "asc"
                                    }
                                    onClick={() => handleSort("status")}
                                  >
                                    Status
                                  </TableSortLabel>
                                </TableCell>
                                <TableCell>Result</TableCell>
                                <TableCell>Winner</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {roundMatches.map((match) => {
                                const canEdit =
                                  (match.status === "pending" ||
                                    match.status === "ready") &&
                                  match.player2_id !== null;
                                const matchNumber =
                                  matchNumberById.get(match.id) ?? 0;
                                return (
                                  <TableRow key={match.id}>
                                    <TableCell>{matchNumber}</TableCell>
                                    <TableCell>
                                      <Box
                                        display="flex"
                                        alignItems="center"
                                        gap={1}
                                      >
                                        {match.player1_name}
                                        {canEdit && (
                                          <IconButton
                                            size="small"
                                            color="primary"
                                            onClick={() =>
                                              handleOpenScoreDialog(
                                                match,
                                                match.player1_id,
                                              )
                                            }
                                            title="Select winner"
                                          >
                                            <EmojiEventsIcon fontSize="small" />
                                          </IconButton>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      {match.player2_name ? (
                                        <Box
                                          display="flex"
                                          alignItems="center"
                                          gap={1}
                                        >
                                          {match.player2_name}
                                          {canEdit && (
                                            <IconButton
                                              size="small"
                                              color="primary"
                                              onClick={() =>
                                                handleOpenScoreDialog(
                                                  match,
                                                  match.player2_id!,
                                                )
                                              }
                                              title="Select winner"
                                            >
                                              <EmojiEventsIcon fontSize="small" />
                                            </IconButton>
                                          )}
                                        </Box>
                                      ) : (
                                        <Chip
                                          label="Bye"
                                          size="small"
                                          color="info"
                                          variant="outlined"
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        label={
                                          match.status === "bye"
                                            ? "Bye"
                                            : match.status === "completed"
                                              ? "Completed"
                                              : match.status === "pending"
                                                ? "Pending"
                                                : "Ready"
                                        }
                                        size="small"
                                        color={
                                          match.status === "bye"
                                            ? "info"
                                            : match.status === "completed"
                                              ? "success"
                                              : match.status === "pending"
                                                ? "warning"
                                                : "default"
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Box
                                        display="flex"
                                        alignItems="center"
                                        gap={1}
                                      >
                                        {match.result || "-"}
                                        {canEdit && (
                                          <IconButton
                                            size="small"
                                            onClick={() =>
                                              handleOpenScoreDialog(match)
                                            }
                                            title="Edit result"
                                          >
                                            <EditIcon fontSize="small" />
                                          </IconButton>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      {match.winner_name || "-"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontStyle: "italic" }}
                      >
                        Pairings not yet generated
                      </Typography>
                    );
                  })()}
                </Box>
              </>
            );
          })()}
        </Paper>
      )}

      {/* Score Entry Dialog */}
      <Dialog
        open={scoreDialogOpen}
        onClose={handleCloseScoreDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record Match Result</DialogTitle>
        <DialogContent>
          {selectedMatch && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="body1" gutterBottom>
                <strong>Match:</strong> {selectedMatch.player1_name} vs{" "}
                {selectedMatch.player2_name || "Bye"}
              </Typography>
              <FormControl component="fieldset" sx={{ mt: 3, mb: 2 }}>
                <FormLabel component="legend">Select Winner</FormLabel>
                <RadioGroup
                  value={selectedWinner}
                  onChange={(e) => {
                    setSelectedWinner(e.target.value);
                    setError(null); // Clear error when winner changes
                  }}
                >
                  {selectedMatch.player2_id && (
                    <>
                      <FormControlLabel
                        value="player1"
                        control={<Radio />}
                        label={selectedMatch.player1_name}
                      />
                      <FormControlLabel
                        value="player2"
                        control={<Radio />}
                        label={selectedMatch.player2_name}
                      />
                      <FormControlLabel
                        value="draw"
                        control={<Radio />}
                        label="Draw"
                      />
                    </>
                  )}
                  {!selectedMatch.player2_id && (
                    <FormControlLabel
                      value="player1"
                      control={<Radio />}
                      label={`${selectedMatch.player1_name} (Bye)`}
                      checked={true}
                    />
                  )}
                </RadioGroup>
              </FormControl>
              {selectedMatch.player2_id && selectedWinner !== "draw" && (
                <Box sx={{ mt: 3 }}>
                  <FormLabel component="legend" sx={{ mb: 2 }}>
                    Game Wins
                  </FormLabel>
                  <Box display="flex" gap={2} alignItems="center">
                    <FormControl variant="outlined" sx={{ flex: 1 }}>
                      <InputLabel>{selectedMatch.player1_name}</InputLabel>
                      <OutlinedInput
                        type="number"
                        value={player1Wins}
                        onChange={(e) => {
                          setPlayer1Wins(
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 3 }}
                        endAdornment={
                          <InputAdornment position="end">wins</InputAdornment>
                        }
                        label={selectedMatch.player1_name}
                        error={
                          selectedWinner === "player1" &&
                          player1Wins <= player2Wins &&
                          player1Wins + player2Wins > 0
                        }
                      />
                    </FormControl>
                    <Typography variant="h6">-</Typography>
                    <FormControl variant="outlined" sx={{ flex: 1 }}>
                      <InputLabel>{selectedMatch.player2_name}</InputLabel>
                      <OutlinedInput
                        type="number"
                        value={player2Wins}
                        onChange={(e) => {
                          setPlayer2Wins(
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          );
                          setError(null); // Clear error on change
                        }}
                        inputProps={{ min: 0, max: 3 }}
                        endAdornment={
                          <InputAdornment position="end">wins</InputAdornment>
                        }
                        label={selectedMatch.player2_name}
                        error={
                          selectedWinner === "player2" &&
                          player2Wins <= player1Wins &&
                          player1Wins + player2Wins > 0
                        }
                      />
                    </FormControl>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    Score will be displayed as: {player1Wins}-{player2Wins}
                  </Typography>
                  {(() => {
                    const validationError = getScoreValidationError();
                    return validationError ? (
                      <Alert severity="error" sx={{ mt: 2 }}>
                        {validationError}
                      </Alert>
                    ) : null;
                  })()}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseScoreDialog} disabled={updatingMatch}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveMatchResult}
            variant="contained"
            disabled={
              updatingMatch ||
              !selectedWinner ||
              getScoreValidationError() !== null
            }
          >
            {updatingMatch ? "Saving..." : "Save Result"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TournamentMatches;
