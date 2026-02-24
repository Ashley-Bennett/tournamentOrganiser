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
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches } from "../utils/tournamentUtils";

interface Tournament {
  id: string;
  name: string;
  status: string;
  num_rounds: number | null;
  is_public: boolean;
}

interface Player {
  id: string;
  name: string;
  dropped: boolean;
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);

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

      // Fetch players
      const { data: pData, error: pErr } = await supabase
        .from("tournament_players")
        .select("id, name, dropped")
        .eq("tournament_id", id);

      if (pErr) {
        setError("Failed to load players.");
        setLoading(false);
        return;
      }
      const playerList = pData ?? [];
      setPlayers(playerList);
      const playerMap = new Map(playerList.map((p) => [p.id, p.name]));

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

      // Auto-select: standings tab for completed tournaments, otherwise current active round
      if (tData.status === "completed") {
        setSelectedRound("standings");
      } else if (enriched.length > 0) {
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
      typeof selectedRound === "number"
        ? matches
            .filter((m) => m.round_number === selectedRound)
            .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
        : [],
    [matches, selectedRound],
  );

  const standings = useMemo(() => {
    const completed = matches.filter(
      (m) => m.status === "completed" || m.status === "bye",
    );
    const raw = buildStandingsFromMatches(
      completed,
      players.map((p) => ({ id: p.id, name: p.name })),
    );
    return sortByTieBreakers(raw);
  }, [matches, players]);

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

  // Pre-round: all visible matches for this round are still "ready" (published but not started)
  const isPreRound =
    roundMatches.length > 0 && roundMatches.every((m) => m.status === "ready");

  const isStandings = selectedRound === "standings";

  const header = (
    <Box mb={isPreRound ? 2 : 1.5} textAlign="center">
      <Typography variant={isPreRound ? "h4" : "h5"} fontWeight={700}>
        {tournament.name}
      </Typography>
      {!isStandings && (
        <Typography variant="body1" color="text.secondary">
          {tournament.num_rounds
            ? `Round ${selectedRound} of ${tournament.num_rounds}`
            : `Round ${selectedRound}`}
          {!isPreRound &&
            totalMatchCount > 0 &&
            ` · ${completedMatchCount}/${totalMatchCount} complete`}
        </Typography>
      )}
    </Box>
  );

  const roundTabs = (rounds.length > 1 || tournament.status === "completed") && (
    <Tabs
      value={selectedRound}
      onChange={(_e, v: number | "standings") => setSelectedRound(v)}
      centered
      sx={{ mb: isPreRound ? 2.5 : 1.5 }}
    >
      {rounds.map((r) => (
        <Tab key={r} label={`Round ${r}`} value={r} />
      ))}
      {tournament.status === "completed" && (
        <Tab label="Standings" value="standings" />
      )}
    </Tabs>
  );

  const footer = (
    <Box textAlign="center" mt={2}>
      <Typography variant="caption" color="text.disabled">
        Refreshes automatically every 30 seconds
      </Typography>
    </Box>
  );

  // ── FINAL STANDINGS ─────────────────────────────────────────────────────────
  if (isStandings) {
    return (
      <Box>
        {header}
        {roundTabs}
        <Paper variant="outlined">
          <Box px={2} py={1}>
            <Typography variant="subtitle2" fontWeight={600}>
              Final Standings
            </Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32, fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>Player</TableCell>
                  <TableCell sx={{ width: 60, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>Record</TableCell>
                  <TableCell sx={{ width: 44, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>Pts</TableCell>
                  <TableCell sx={{ width: 60, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>OMW%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {standings.map((s, i) => {
                  const dropped = players.find((p) => p.id === s.id)?.dropped;
                  const omw = Math.round(s.opponentMatchWinPercentage * 100);
                  return (
                    <TableRow key={s.id} hover sx={{ opacity: dropped ? 0.5 : 1 }}>
                      <TableCell sx={{ color: "text.secondary", fontSize: "0.85rem", fontWeight: i < 3 ? 700 : 400 }}>
                        {i + 1}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: "0.9rem",
                          fontWeight: i < 3 ? 600 : 400,
                          maxWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.name}
                        {dropped && (
                          <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                            (dropped)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ textAlign: "right", color: "text.secondary", fontSize: "0.85rem" }}>
                        {s.wins}-{s.losses}-{s.draws}
                      </TableCell>
                      <TableCell sx={{ textAlign: "right", fontWeight: 700, fontSize: "0.9rem" }}>
                        {s.matchPoints}
                      </TableCell>
                      <TableCell sx={{ textAlign: "right", color: "text.secondary", fontSize: "0.85rem" }}>
                        {omw}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        {footer}
      </Box>
    );
  }

  // ── PRE-ROUND: large card grid ──────────────────────────────────────────────
  if (isPreRound) {
    return (
      <Box>
        {header}
        {roundTabs}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 2,
          }}
        >
          {roundMatches.map((m) => {
            const isBye = m.player2_id === null;
            return (
              <Paper
                key={m.id}
                variant="outlined"
                sx={{
                  p: 2.5,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                  borderRadius: 2,
                }}
              >
                {/* Table number */}
                <Typography
                  variant="overline"
                  sx={{
                    fontSize: "0.7rem",
                    letterSpacing: 2,
                    color: "text.secondary",
                    lineHeight: 1,
                  }}
                >
                  Table {m.match_number ?? "—"}
                </Typography>

                {/* Player 1 */}
                <Typography
                  variant="h6"
                  fontWeight={700}
                  textAlign="center"
                  sx={{
                    fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
                    lineHeight: 1.2,
                    wordBreak: "break-word",
                  }}
                >
                  {m.player1_name}
                </Typography>

                {/* vs / bye divider */}
                {isBye ? (
                  <Chip label="BYE" size="small" sx={{ my: 0.5 }} />
                ) : (
                  <Typography
                    variant="body2"
                    color="text.disabled"
                    fontWeight={500}
                    sx={{ my: 0.25 }}
                  >
                    vs
                  </Typography>
                )}

                {/* Player 2 */}
                {!isBye && (
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    textAlign="center"
                    sx={{
                      fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
                      lineHeight: 1.2,
                      wordBreak: "break-word",
                    }}
                  >
                    {m.player2_name}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Box>
        {footer}
      </Box>
    );
  }

  // ── ROUND ACTIVE / COMPLETE: compact table ──────────────────────────────────
  return (
    <Box>
      {header}
      {roundTabs}

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
                        <Chip label="BYE" size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
                      ) : isCompleted || hasTempResult ? (
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, fontSize: "0.82rem", opacity: hasTempResult ? 0.6 : 1 }}
                        >
                          {displayResult ?? "—"}
                        </Typography>
                      ) : isPending ? (
                        <Chip label="Playing" color="primary" size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
                      ) : (
                        <Chip label="Waiting" size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 20 }} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {roundMatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: "center", color: "text.disabled", py: 3 }}>
                    No pairings for this round yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {footer}
    </Box>
  );
};

export default TournamentPairings;
