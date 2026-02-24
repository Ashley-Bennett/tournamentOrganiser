import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
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
  Alert,
  Chip,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
} from "@mui/material";
import { supabase } from "../supabaseClient";

interface Tournament {
  id: string;
  name: string;
  status: string;
  num_rounds: number | null;
  is_public: boolean;
}

interface Match {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number | null;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  result: string | null;
  temp_winner_id: string | null;
  temp_result: string | null;
  pairings_published: boolean;
  status: "ready" | "pending" | "completed" | "bye";
}

interface MatchWithPlayers extends Match {
  player1_name: string;
  player2_name: string | null;
}

const TournamentPairings: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(1);

  useEffect(() => {
    if (!id) {
      setError("Missing tournament ID.");
      setLoading(false);
      return;
    }

    const load = async () => {
      // Fetch tournament (only succeeds if is_public = true due to RLS)
      const { data: tData, error: tErr } = await supabase
        .from("tournaments")
        .select("id, name, status, num_rounds, is_public")
        .eq("id", id)
        .single();

      if (tErr || !tData) {
        setError(
          "This tournament is not available. It may be private or may not exist.",
        );
        setLoading(false);
        return;
      }

      if (!tData.is_public) {
        setError("This tournament is private.");
        setLoading(false);
        return;
      }

      setTournament(tData);

      // Fetch players (needed to resolve names)
      const { data: pData, error: pErr } = await supabase
        .from("tournament_players")
        .select("id, name")
        .eq("tournament_id", id);

      if (pErr) {
        setError("Failed to load players.");
        setLoading(false);
        return;
      }
      const playerMap = new Map((pData ?? []).map((p) => [p.id, p.name]));

      // Fetch all matches
      const { data: mData, error: mErr } = await supabase
        .from("tournament_matches")
        .select(
          "id, tournament_id, round_number, match_number, player1_id, player2_id, winner_id, result, temp_winner_id, temp_result, pairings_published, status",
        )
        .eq("tournament_id", id)
        .order("round_number", { ascending: true })
        .order("match_number", { ascending: true });

      if (mErr) {
        setError("Failed to load matches.");
        setLoading(false);
        return;
      }

      const allEnriched: MatchWithPlayers[] = (mData ?? []).map((m) => ({
        ...m,
        player1_name: playerMap.get(m.player1_id) ?? "Unknown",
        player2_name: m.player2_id
          ? (playerMap.get(m.player2_id) ?? "Unknown")
          : null,
      }));

      // Only expose matches that have been published or are in progress/complete
      const enriched = allEnriched.filter(
        (m) => m.status !== "ready" || m.pairings_published,
      );

      setMatches(enriched);

      // Auto-select the current active round (only from visible matches)
      if (enriched.length > 0) {
        const pendingRounds = enriched
          .filter((m) => m.status === "pending" || (m.status === "ready" && m.pairings_published))
          .map((m) => m.round_number);
        const allRounds = enriched.map((m) => m.round_number);
        const active =
          pendingRounds.length > 0
            ? Math.max(...pendingRounds)
            : Math.max(...allRounds);
        setSelectedRound(active);
      }

      setLoading(false);
    };

    setLoading(true);
    setError(null);
    void load();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [id]);

  const rounds = useMemo(
    () =>
      [...new Set(matches.map((m) => m.round_number))].sort((a, b) => a - b),
    [matches],
  );

  const roundMatches = useMemo(
    () =>
      matches
        .filter((m) => m.round_number === selectedRound)
        .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
    [matches, selectedRound],
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box py={4}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!tournament) return null;

  const completedMatchCount = roundMatches.filter(
    (m) => m.status === "completed" || m.status === "bye",
  ).length;
  const totalMatchCount = roundMatches.length;

  return (
    <Box>
      {/* Tournament name */}
      <Box mb={1.5} textAlign="center">
        <Typography variant="h5" fontWeight={700}>
          {tournament.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tournament.num_rounds
            ? `Round ${selectedRound} of ${tournament.num_rounds}`
            : `Round ${selectedRound}`}
          {totalMatchCount > 0 &&
            ` · ${completedMatchCount}/${totalMatchCount} complete`}
        </Typography>
      </Box>

      {/* Round tabs */}
      {rounds.length > 1 && (
        <Tabs
          value={selectedRound}
          onChange={(_e, v: number) => setSelectedRound(v)}
          centered
          sx={{ mb: 1.5 }}
        >
          {rounds.map((r) => (
            <Tab key={r} label={`Round ${r}`} value={r} />
          ))}
        </Tabs>
      )}

      {/* Pairings table */}
      <Paper variant="outlined">
        <Box px={2} py={1}>
          <Typography variant="subtitle2" fontWeight={600}>
            Pairings — Round {selectedRound}
          </Typography>
        </Box>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36, fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Table
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Player 1
                </TableCell>
                <TableCell sx={{ width: 24, textAlign: "center", fontSize: "0.75rem", color: "text.secondary", px: 0 }}>
                  vs
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Player 2
                </TableCell>
                <TableCell sx={{ width: 68, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Result
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roundMatches.map((m) => {
                const isBye = m.status === "bye" || m.player2_id === null;
                const isCompleted = m.status === "completed";
                const isPending = m.status === "pending";
                // Use temp values while pending, fall back to committed values
                const displayWinnerId = m.winner_id ?? m.temp_winner_id;
                const displayResult = m.result ?? m.temp_result;
                const hasTempResult = isPending && !!m.temp_result;
                const p1Won = displayWinnerId === m.player1_id;
                const p2Won = displayWinnerId === m.player2_id;

                return (
                  <TableRow key={m.id} hover>
                    <TableCell sx={{ color: "text.secondary", fontSize: "0.85rem", fontWeight: 500 }}>
                      {m.match_number ?? "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: p1Won ? 700 : 400,
                        bgcolor: p1Won ? "rgba(76, 175, 80, 0.1)" : "inherit",
                        maxWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.player1_name}
                    </TableCell>
                    <TableCell sx={{ textAlign: "center", color: "text.disabled", fontSize: "0.75rem", px: 0 }}>
                      vs
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: p2Won ? 700 : 400,
                        color: isBye ? "text.disabled" : "inherit",
                        fontStyle: isBye ? "italic" : "normal",
                        bgcolor: p2Won ? "rgba(76, 175, 80, 0.1)" : "inherit",
                        maxWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isBye ? "Bye" : m.player2_name}
                    </TableCell>
                    <TableCell sx={{ textAlign: "right" }}>
                      {isBye ? (
                        <Chip
                          label="BYE"
                          size="small"
                          sx={{ fontSize: "0.65rem", height: 20 }}
                        />
                      ) : isCompleted || hasTempResult ? (
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            opacity: hasTempResult ? 0.6 : 1,
                          }}
                        >
                          {displayResult ?? "—"}
                        </Typography>
                      ) : isPending ? (
                        <Chip
                          label="Playing"
                          color="primary"
                          size="small"
                          sx={{ fontSize: "0.65rem", height: 20 }}
                        />
                      ) : (
                        <Chip
                          label="Waiting"
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: "0.65rem", height: 20 }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {roundMatches.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    sx={{ textAlign: "center", color: "text.disabled", py: 3 }}
                  >
                    No pairings for this round yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Footer */}
      <Box textAlign="center" mt={2}>
        <Typography variant="caption" color="text.disabled">
          Refreshes automatically every 30 seconds
        </Typography>
      </Box>
    </Box>
  );
};

export default TournamentPairings;
