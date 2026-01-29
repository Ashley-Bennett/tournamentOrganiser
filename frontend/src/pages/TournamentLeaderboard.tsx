import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Button,
  Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthContext";
import {
  calculateMatchPoints,
  type PlayerStanding,
} from "../utils/tournamentPairing";
import {
  sortByTieBreakers,
  type PlayerWithTieBreakers,
} from "../utils/tieBreaking";

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

const TournamentLeaderboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch tournament
        const { data: tournamentData, error: tournamentError } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, tournament_type, num_rounds, created_at, created_by",
          )
          .eq("id", id)
          .eq("created_by", user.id)
          .maybeSingle();

        if (tournamentError) {
          throw new Error(
            tournamentError.message || "Failed to load tournament",
          );
        }
        if (!tournamentData) {
          setError("Tournament not found");
          setTournament(null);
          setLoading(false);
          return;
        }

        setTournament(tournamentData as TournamentSummary);

        // Fetch all matches
        const { data: matchesData, error: matchesError } = await supabase
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", id)
          .order("round_number", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (matchesError) {
          throw new Error(matchesError.message || "Failed to load matches");
        }

        if (!matchesData || matchesData.length === 0) {
          setMatches([]);
          setLoading(false);
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
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [id, user, authLoading, navigate]);

  const finalStandings = useMemo(() => {
    if (!matches.length) return [];

    // Get all unique players
    const playerIds = new Set<string>();
    matches.forEach((match) => {
      playerIds.add(match.player1_id);
      if (match.player2_id) {
        playerIds.add(match.player2_id);
      }
    });

    // Initialize standings
    const standingsMap = new Map<string, PlayerStanding>();
    matches.forEach((match) => {
      if (!standingsMap.has(match.player1_id)) {
        standingsMap.set(match.player1_id, {
          id: match.player1_id,
          name: match.player1_name,
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      }
      if (match.player2_id && !standingsMap.has(match.player2_id)) {
        standingsMap.set(match.player2_id, {
          id: match.player2_id,
          name: match.player2_name || "Unknown",
          matchPoints: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          opponents: [],
          byesReceived: 0,
        });
      }
    });

    // Process all matches to calculate standings
    matches.forEach((match) => {
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
    return sortByTieBreakers(standings);
  }, [matches]);

  if (authLoading || loading) {
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
            onClick={() => navigate("/tournaments")}
            sx={{ mr: 2 }}
          >
            Back to tournaments
          </Button>
          <Typography variant="h4" component="h1">
            Leaderboard
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

  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
  };

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
          {tournament.name} - Final Standings
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ overflow: "hidden" }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>Rank</TableCell>
                <TableCell sx={{ fontWeight: "bold" }}>Player</TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  Record
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  Match Points
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  OMW%
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  OOMW%
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {finalStandings.map((player, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;
                return (
                  <TableRow
                    key={player.id}
                    sx={{
                      backgroundColor: isTopThree
                        ? rank === 1
                          ? "rgba(255, 215, 0, 0.1)"
                          : rank === 2
                            ? "rgba(192, 192, 192, 0.1)"
                            : "rgba(205, 127, 50, 0.1)"
                        : "transparent",
                      "&:hover": {
                        backgroundColor: isTopThree
                          ? rank === 1
                            ? "rgba(255, 215, 0, 0.15)"
                            : rank === 2
                              ? "rgba(192, 192, 192, 0.15)"
                              : "rgba(205, 127, 50, 0.15)"
                          : "rgba(0, 0, 0, 0.04)",
                      },
                    }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {isTopThree && (
                          <EmojiEventsIcon
                            sx={{
                              color:
                                rank === 1
                                  ? "gold"
                                  : rank === 2
                                    ? "silver"
                                    : "#CD7F32",
                            }}
                          />
                        )}
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                        >
                          {getRankDisplay(rank)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                      >
                        {player.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {player.wins}-{player.losses}-{player.draws}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: isTopThree ? "bold" : "normal" }}
                      >
                        {player.matchPoints}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {(player.opponentMatchWinPercentage * 100).toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {(
                          player.opponentOpponentMatchWinPercentage * 100
                        ).toFixed(1)}
                        %
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default TournamentLeaderboard;
