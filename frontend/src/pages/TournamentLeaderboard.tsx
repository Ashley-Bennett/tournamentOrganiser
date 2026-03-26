import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Alert,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { supabase } from "../supabaseClient";
import PageLoading from "../components/PageLoading";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches } from "../utils/tournamentUtils";
import { TournamentSummary } from "../types/tournament";
import StandingsTable from "../components/StandingsTable";

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

interface LeaderboardPlayer {
  id: string;
  name: string;
  dropped: boolean;
  dropped_at_round: number | null;
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

const TournamentLeaderboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { workspaceId, wPath } = useWorkspace();
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
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

        const { data: tournamentData, error: tournamentError } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, tournament_type, num_rounds, created_at, created_by",
          )
          .eq("id", id)
          .eq("workspace_id", workspaceId ?? "")
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

        const playerIds = new Set<string>();
        matchesData.forEach((match) => {
          playerIds.add(match.player1_id);
          if (match.player2_id) playerIds.add(match.player2_id);
          if (match.winner_id) playerIds.add(match.winner_id);
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

        const { data: allPlayersData } = await supabase
          .from("tournament_players")
          .select("id, name, dropped, dropped_at_round, deck_pokemon1, deck_pokemon2")
          .eq("tournament_id", id);
        setPlayers((allPlayersData as LeaderboardPlayer[]) ?? []);

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
  }, [id, user, authLoading, navigate, workspaceId]);

  const droppedMap = useMemo(() => {
    const m = new Map<string, number | null>();
    players.forEach((p) => {
      if (p.dropped) m.set(p.id, p.dropped_at_round);
    });
    return m;
  }, [players]);

  const deckMap = useMemo(() => {
    const m = new Map<string, [number | null, number | null]>();
    players.forEach((p) => {
      if (p.deck_pokemon1 != null || p.deck_pokemon2 != null) {
        m.set(p.id, [p.deck_pokemon1, p.deck_pokemon2]);
      }
    });
    return m;
  }, [players]);

  const finalStandings = useMemo(() => {
    if (!matches.length) return [];
    return sortByTieBreakers(
      buildStandingsFromMatches(matches),
      new Set(droppedMap.keys()),
    );
  }, [matches, droppedMap]);

  if (authLoading || loading) return <PageLoading />;

  if (error || !tournament) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(wPath("/tournaments"))}
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

  return (
    <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(wPath(`/tournaments/${id ?? ""}`))}
          sx={{ mr: 2 }}
        >
          Back to tournament
        </Button>
        <Typography variant="h4" component="h1">
          {tournament.name} — Final Standings
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {finalStandings.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No standings available yet.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <StandingsTable standings={finalStandings} droppedMap={droppedMap} deckMap={deckMap.size > 0 ? deckMap : undefined} />
        </Box>
      )}
    </Box>
  );
};

export default TournamentLeaderboard;
