import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Typography,
  Alert,
} from "@mui/material";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import { supabase } from "../supabaseClient";
import { getEntry, getAllEntries } from "../utils/playerStorage";
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches } from "../utils/tournamentUtils";
import { getSpriteUrl } from "../utils/pokemonCache";
import StandingsTable from "../components/StandingsTable";
import DeckPickerDialog from "../components/DeckPickerDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TournamentInfo {
  id: string;
  name: string;
  status: string;
  num_rounds: number | null;
  round_duration_minutes: number | null;
  current_round_started_at: string | null;
  round_elapsed_seconds: number | null;
  round_is_paused: boolean | null;
  round_note: string | null;
}

interface PlayerInfo {
  id: string;
  name: string;
  dropped: boolean;
  dropped_at_round: number | null;
  deck_pokemon1?: number | null;
  deck_pokemon2?: number | null;
}

interface MatchWithNames {
  id: string;
  round_number: number;
  match_number: number | null;
  player1_id: string;
  player1_name: string;
  player2_id: string | null;
  player2_name: string | null;
  winner_id: string | null;
  result: string | null;
  temp_result: string | null;
  temp_winner_id: string | null;
  status: "ready" | "pending" | "completed" | "bye";
  confirmed_by: "organiser" | "player_agreement" | "player_report" | "conflict" | null;
  pairings_published: boolean;
  is_my_match: boolean;
  report_count: number;
}

interface ViewData {
  tournament: TournamentInfo;
  player: PlayerInfo;
  players: PlayerInfo[];
  matches: MatchWithNames[];
  my_report: { reported_outcome: "win" | "loss" | "draw" } | null;
}

type SubmitStatus = "submitted" | "agreed" | "conflict" | null;

// ── MyMatchCard ───────────────────────────────────────────────────────────────

function MyMatchCard({
  match,
  playerId,
  myReport,
  entry,
  onRefresh,
}: {
  match: MatchWithNames | null;
  playerId: string;
  myReport: { reported_outcome: "win" | "loss" | "draw" } | null;
  entry: { playerId: string; deviceToken: string } | null;
  onRefresh: () => void;
}) {
  const [selectedOutcome, setSelectedOutcome] = useState<"win" | "loss" | "draw" | null>(null);
  const [undone, setUndone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const prevReportOutcomeRef = useRef(myReport?.reported_outcome);

  // Sync selected outcome from server state when myReport changes
  useEffect(() => {
    const prev = prevReportOutcomeRef.current;
    const next = myReport?.reported_outcome;
    if (next !== prev) {
      if (next) setSelectedOutcome(next);
      if (!next) {
        // Report was cleared (e.g. organiser confirmed and round advanced)
        setSelectedOutcome(null);
        setSubmitStatus(null);
      }
      setUndone(false);
      prevReportOutcomeRef.current = next;
    }
  }, [myReport?.reported_outcome]);

  const inSubmittedMode = Boolean(myReport) && !undone;

  const handleSubmit = async () => {
    if (!selectedOutcome || !entry || !match) return;
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc("submit_match_result", {
      p_match_id: match.id,
      p_player_id: entry.playerId,
      p_device_token: entry.deviceToken,
      p_reported_outcome: selectedOutcome,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    setUndone(false);
    setSubmitStatus((data as { status: string }).status as SubmitStatus);
    onRefresh();
  };

  const handleUndo = () => {
    setUndone(true);
    setSubmitStatus(null);
    setSubmitError(null);
  };

  if (!match) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No pairing this round.
        </Typography>
      </Paper>
    );
  }

  const isBye = match.player2_id === null || match.status === "bye";
  const isCompleted = match.status === "completed";
  const opponentName = match.player1_id === playerId ? match.player2_name : match.player1_name;
  const iWon = match.winner_id === playerId;
  const iLost = match.winner_id !== null && match.winner_id !== playerId;
  const isDraw = isCompleted && match.winner_id === null;
  const tableNum = match.match_number;

  const outcomeLabel = iWon ? "You won" : iLost ? "You lost" : isDraw ? "Draw" : null;
  const outcomeColor = iWon ? "success" : iLost ? "error" : "default";

  const outcomeButtonLabel: Record<string, string> = {
    win: "I won",
    loss: "I lost",
    draw: "Draw",
  };
  const outcomeButtonColor: Record<string, "success" | "error" | "inherit"> = {
    win: "success",
    loss: "error",
    draw: "inherit",
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        mb: 2,
        borderRadius: 2,
        borderColor: "primary.main",
        borderWidth: 2,
      }}
    >
      <Typography
        variant="overline"
        sx={{ fontSize: "0.7rem", letterSpacing: 2, color: "primary.main" }}
      >
        Your Match{tableNum != null ? ` · Table ${tableNum}` : ""}
      </Typography>

      <Box display="flex" alignItems="center" gap={1.5} mt={0.5} mb={1}>
        <Typography variant="h6" fontWeight={700}>
          vs {isBye ? "BYE" : (opponentName ?? "Opponent")}
        </Typography>
        {isBye && <Chip label="BYE" size="small" />}
        {outcomeLabel && (
          <Chip
            label={outcomeLabel}
            color={outcomeColor as "success" | "error" | "default"}
            size="small"
          />
        )}
      </Box>

      {/* Result submission — pending match */}
      {match.status === "pending" && !isBye && (
        <>
          {inSubmittedMode ? (
            /* ── Submitted mode ── */
            <Box>
              <Box display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
                <Chip
                  label={`Submitted: ${outcomeButtonLabel[myReport!.reported_outcome]}`}
                  color="primary"
                  size="small"
                />
                {submitStatus === "agreed" && (
                  <Chip label="Both players agree" color="success" size="small" />
                )}
                {submitStatus === "conflict" && (
                  <Chip label="Conflict" color="warning" size="small" />
                )}
              </Box>
              {submitStatus === "conflict" && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  Both players reported different results — your organiser will resolve this.
                </Alert>
              )}
              {submitStatus === "agreed" && (
                <Alert severity="success" sx={{ mb: 1 }}>
                  Both players agree — waiting for the organiser to confirm.
                </Alert>
              )}
              {!submitStatus && (
                <Typography variant="body2" color="text.secondary" mb={1}>
                  Waiting for the organiser to confirm…
                </Typography>
              )}
              <Button size="small" variant="outlined" onClick={handleUndo}>
                Undo
              </Button>
            </Box>
          ) : (
            /* ── Selection mode ── */
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                How did the match go?
              </Typography>
              <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
                {(["win", "draw", "loss"] as const).map((o) => (
                  <Button
                    key={o}
                    size="large"
                    variant={selectedOutcome === o ? "contained" : "outlined"}
                    color={outcomeButtonColor[o]}
                    onClick={() => setSelectedOutcome(o)}
                    sx={{ flex: 1, minWidth: 90, py: 1.5 }}
                  >
                    {outcomeButtonLabel[o]}
                  </Button>
                ))}
              </Box>
              {submitError && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {submitError}
                </Alert>
              )}
              <Button
                size="large"
                fullWidth
                variant="contained"
                disabled={!selectedOutcome || submitting}
                onClick={() => void handleSubmit()}
                sx={{ py: 1.5 }}
              >
                {submitting ? <CircularProgress size={20} /> : "Submit result"}
              </Button>
            </Box>
          )}
        </>
      )}

      {isCompleted && (
        <Typography variant="body2" color="text.secondary">
          Result confirmed by your organiser.
        </Typography>
      )}

      {match.status === "ready" && (
        <Typography variant="body2" color="text.secondary">
          Waiting for round to start…
        </Typography>
      )}
    </Paper>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PlayerTournamentView: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [viewData, setViewData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);

  const didInitRoundRef = useRef(false);
  const initialRoundsLoadedRef = useRef(false);
  const prevRoundCountRef = useRef(0);
  const prevTournamentStatusRef = useRef<string | null>(null);

  // Get the player's credentials from localStorage
  const entry = useMemo(
    () => (tournamentId ? getEntry(tournamentId) : null),
    [tournamentId],
  );

  const otherTournaments = useMemo(
    () => getAllEntries().filter((e) => e.tournamentId !== tournamentId),
    [tournamentId],
  );

  useEffect(() => {
    if (!tournamentId || !entry) return;

    const load = async () => {
      const { data, error: rpcError } = await supabase.rpc(
        "get_player_tournament_view",
        {
          p_tournament_id: tournamentId,
          p_player_id: entry.playerId,
          p_device_token: entry.deviceToken,
        },
      );

      if (rpcError) {
        setError("Failed to load tournament data.");
        setLoading(false);
        return;
      }

      const d = data as ViewData;
      setViewData(d);

      // Auto-select round on first load
      if (!didInitRoundRef.current) {
        didInitRoundRef.current = true;
        if (d.tournament.status === "completed") {
          setSelectedRound("standings");
        } else if (d.matches && d.matches.length > 0) {
          const published = d.matches.filter(
            (m) => m.pairings_published || m.status === "pending" || m.status === "completed" || m.status === "bye",
          );
          if (published.length > 0) {
            const pendingRounds = published
              .filter((m) => m.status === "pending" || (m.status === "ready" && m.pairings_published))
              .map((m) => m.round_number);
            const allRounds = published.map((m) => m.round_number);
            const active =
              pendingRounds.length > 0
                ? Math.max(...pendingRounds)
                : Math.max(...allRounds);
            setSelectedRound(active);
          }
        }
      }

      setError(null);
      setLoading(false);
    };

    setLoading(true);
    void load();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Full data poll every 5s as fallback
    const dataPollId = setInterval(() => void load(), 5_000);

    // Real-time subscription on tournament_matches
    const channel = supabase
      .channel(`player-view-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => { void load(); },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        (payload) => {
          const newRow = payload.new as { status?: string } | null;
          if (newRow?.status === "completed") {
            setSelectedRound("standings");
          }
          void load();
        },
      )
      .subscribe();

    return () => {
      clearInterval(dataPollId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [tournamentId, entry]);

  // Auto-switch to standings when tournament completes
  const tournamentStatus = viewData?.tournament.status ?? null;
  useEffect(() => {
    if (
      tournamentStatus === "completed" &&
      prevTournamentStatusRef.current !== "completed"
    ) {
      setSelectedRound("standings");
    }
    prevTournamentStatusRef.current = tournamentStatus;
  }, [tournamentStatus]);

  // Auto-switch to newly added rounds
  const rounds = useMemo(
    () =>
      viewData
        ? [...new Set(
            viewData.matches
              .filter((m) => m.pairings_published || m.status !== "ready")
              .map((m) => m.round_number),
          )].sort((a, b) => a - b)
        : [],
    [viewData],
  );

  useEffect(() => {
    if (rounds.length === 0) return;
    if (!initialRoundsLoadedRef.current) {
      initialRoundsLoadedRef.current = true;
      prevRoundCountRef.current = rounds.length;
      return;
    }
    if (rounds.length > prevRoundCountRef.current) {
      setSelectedRound(Math.max(...rounds));
    }
    prevRoundCountRef.current = rounds.length;
  }, [rounds]);

  const handleRefresh = useCallback(async () => {
    if (!tournamentId || !entry) return;
    const { data: fresh } = await supabase.rpc("get_player_tournament_view", {
      p_tournament_id: tournamentId,
      p_player_id: entry.playerId,
      p_device_token: entry.deviceToken,
    });
    if (fresh) setViewData(fresh as ViewData);
  }, [tournamentId, entry]);

  // ── Derived state (all hooks must be before any conditional returns) ─────────

  const matches = useMemo(() => viewData?.matches ?? [], [viewData]);
  const players = useMemo(() => viewData?.players ?? [], [viewData]);

  const roundMatches = useMemo(
    () =>
      typeof selectedRound === "number"
        ? matches
            .filter((m) => m.round_number === selectedRound)
            .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
        : [],
    [matches, selectedRound],
  );

  const myRoundMatch = useMemo(
    () =>
      typeof selectedRound === "number"
        ? (matches.find((m) => m.is_my_match && m.round_number === selectedRound) ?? null)
        : null,
    [matches, selectedRound],
  );

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
        m.set(p.id, [p.deck_pokemon1 ?? null, p.deck_pokemon2 ?? null]);
      }
    });
    return m;
  }, [players]);

  const handleSaveDeck = useCallback(
    async (p1: number | null, p2: number | null) => {
      if (!tournamentId || !entry) return;
      const { error: rpcError } = await supabase.rpc("set_player_deck", {
        p_tournament_id: tournamentId,
        p_player_id: entry.playerId,
        p_device_token: entry.deviceToken,
        p_pokemon1: p1,
        p_pokemon2: p2,
      });
      if (rpcError) throw new Error(rpcError.message);
      await handleRefresh();
    },
    [tournamentId, entry, handleRefresh],
  );

  const standings = useMemo(() => {
    const completed = matches.filter(
      (m) => m.status === "completed" || m.status === "bye",
    );
    const raw = buildStandingsFromMatches(
      completed,
      players.map((p) => ({ id: p.id, name: p.name })),
    );
    return sortByTieBreakers(raw, new Set(droppedMap.keys()));
  }, [matches, players, droppedMap]);

  const recordMap = useMemo(() => {
    const m = new Map<string, string>();
    standings.forEach((s) => {
      m.set(s.id, `${s.wins}-${s.losses}${s.draws > 0 ? `-${s.draws}` : ""}`);
    });
    return m;
  }, [standings]);

  // ── Early returns ──────────────────────────────────────────────────────────

  if (!entry) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" px={2}>
        <Paper sx={{ p: 4, maxWidth: 400, width: "100%", textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>Not registered</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            You haven&apos;t joined this tournament on this device.
          </Typography>
          {tournamentId && (
            <Button component={Link} to={`/join/${tournamentId}`} variant="contained">
              Join tournament
            </Button>
          )}
        </Paper>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !viewData) {
    return (
      <Box py={4}>
        <Alert severity="error">{error ?? "Something went wrong."}</Alert>
      </Box>
    );
  }

  const { tournament, player, my_report } = viewData;
  const isStandings = selectedRound === "standings";

  const statusChip =
    tournament.status === "completed" ? (
      <Chip label="Completed" size="small" />
    ) : tournament.status === "active" ? (
      <Chip label="In progress" color="primary" size="small" />
    ) : (
      <Chip label="Draft" size="small" variant="outlined" />
    );

  const header = (
    <Box mb={2}>
      <Typography
        variant="caption"
        component={Link}
        to="/my-tournaments"
        sx={{ color: "text.secondary", textDecoration: "none", "&:hover": { textDecoration: "underline" }, mb: 0.75, display: "inline-block" }}
      >
        {otherTournaments.length > 0
          ? `← My tournaments (${otherTournaments.length + 1} on this device)`
          : "← My tournaments"}
      </Typography>
      <Box display="flex" alignItems="center" gap={1} mb={0.25}>
        <Typography variant="h5" fontWeight={700}>
          {tournament.name}
        </Typography>
        {statusChip}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        Playing as <strong>{player.name}</strong>
        {isStandings
          ? " · Final Standings"
          : typeof selectedRound === "number" && tournament.num_rounds
            ? ` · Round ${selectedRound} of ${tournament.num_rounds}`
            : typeof selectedRound === "number"
              ? ` · Round ${selectedRound}`
              : ""}
      </Typography>
      <Box display="flex" alignItems="center" gap={1} mt={1}>
        <Button
          size="small"
          variant={player.deck_pokemon1 ? "outlined" : "contained"}
          startIcon={<CatchingPokemonIcon />}
          onClick={() => setDeckPickerOpen(true)}
        >
          {player.deck_pokemon1 ? "Edit deck" : "Choose deck"}
        </Button>
        {player.deck_pokemon1 != null && (
          <img
            src={getSpriteUrl(player.deck_pokemon1)}
            alt=""
            style={{ width: 32, height: 32, imageRendering: "pixelated" }}
          />
        )}
        {player.deck_pokemon2 != null && (
          <img
            src={getSpriteUrl(player.deck_pokemon2)}
            alt=""
            style={{ width: 32, height: 32, imageRendering: "pixelated" }}
          />
        )}
      </Box>
    </Box>
  );

  const roundTabs = (rounds.length > 1 || tournament.status === "completed") && (
    <Tabs
      value={selectedRound}
      onChange={(_e, v: number | "standings") => {
        setSelectedRound(v);
      }}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ mb: 2 }}
    >
      {rounds.map((r) => (
        <Tab key={r} label={`Round ${r}`} value={r} />
      ))}
      {tournament.status === "completed" && (
        <Tab label="Standings" value="standings" />
      )}
    </Tabs>
  );

  // ── STANDINGS ───────────────────────────────────────────────────────────────
  if (isStandings) {
    return (
      <Box>
        {header}
        {roundTabs}
        <StandingsTable standings={standings} droppedMap={droppedMap} deckMap={deckMap} currentPlayerId={entry?.playerId} />
        <Box textAlign="center" mt={2}>
          <Typography variant="caption" color="text.disabled">Updates automatically</Typography>
        </Box>
        <DeckPickerDialog
          open={deckPickerOpen}
          onClose={() => setDeckPickerOpen(false)}
          initialPokemon1={viewData?.player.deck_pokemon1 ?? null}
          initialPokemon2={viewData?.player.deck_pokemon2 ?? null}
          onSave={handleSaveDeck}
        />
      </Box>
    );
  }

  // ── ROUND VIEW ──────────────────────────────────────────────────────────────
  return (
    <Box>
      {header}
      {roundTabs}

      {tournament.round_note && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {tournament.round_note}
        </Alert>
      )}

      {/* Player's own match */}
      <MyMatchCard
        match={myRoundMatch}
        playerId={player.id}
        myReport={my_report}
        entry={entry}
        onRefresh={() => void handleRefresh()}
      />

      {/* Full pairings */}
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
                <TableCell
                  sx={{ width: 36, fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}
                >
                  Table
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Player 1
                </TableCell>
                <TableCell
                  sx={{ width: 24, textAlign: "center", fontSize: "0.75rem", color: "text.secondary", px: 0 }}
                >
                  vs
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}>
                  Player 2
                </TableCell>
                <TableCell
                  sx={{ width: 68, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "text.secondary" }}
                >
                  Result
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roundMatches.map((m) => {
                const isBye = m.status === "bye" || m.player2_id === null;
                const isConflict = m.confirmed_by === "conflict";
                const isCompleted = m.status === "completed" || m.confirmed_by === "player_report" || m.confirmed_by === "player_agreement";
                const hasTempResult = !isCompleted && !isConflict && m.temp_result !== null;
                const isPending = m.status === "pending" && !isCompleted && !isConflict && !hasTempResult;
                const displayResult = m.result ?? m.temp_result;
                const displayWinnerId = m.winner_id ?? m.temp_winner_id;
                const p1Won = displayWinnerId === m.player1_id;
                const p2Won = displayWinnerId === m.player2_id;
                const isMyRow = m.is_my_match;

                return (
                  <TableRow
                    key={m.id}
                    hover
                    sx={
                      isMyRow
                        ? { bgcolor: "primary.main", "& td": { color: "primary.contrastText" } }
                        : {}
                    }
                  >
                    <TableCell sx={{ fontSize: "0.85rem", fontWeight: 500, color: isMyRow ? "inherit" : "text.secondary" }}>
                      {m.match_number ?? "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: p1Won ? 700 : 400,
                        bgcolor: !isMyRow && p1Won ? "rgba(76, 175, 80, 0.1)" : "inherit",
                        maxWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.player1_name}
                      {recordMap.has(m.player1_id) && (
                        <Typography component="span" variant="caption" sx={{ ml: 0.75, opacity: 0.6, fontWeight: 400 }}>
                          {recordMap.get(m.player1_id)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: "center", fontSize: "0.75rem", px: 0, color: isMyRow ? "inherit" : "text.disabled" }}>
                      vs
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.9rem",
                        fontWeight: p2Won ? 700 : 400,
                        color: isBye && !isMyRow ? "text.disabled" : "inherit",
                        fontStyle: isBye ? "italic" : "normal",
                        bgcolor: !isMyRow && p2Won ? "rgba(76, 175, 80, 0.1)" : "inherit",
                        maxWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isBye ? "Bye" : (
                        <>
                          {m.player2_name}
                          {m.player2_id && recordMap.has(m.player2_id) && (
                            <Typography component="span" variant="caption" sx={{ ml: 0.75, opacity: 0.6, fontWeight: 400 }}>
                              {recordMap.get(m.player2_id)}
                            </Typography>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: "right" }}>
                      {isBye ? (
                        <Chip label="BYE" size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
                      ) : isCompleted || hasTempResult ? (
                        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.82rem", opacity: hasTempResult ? 0.7 : 1 }}>
                          {displayResult ?? "—"}
                        </Typography>
                      ) : isConflict ? (
                        <Chip
                          label="Conflict"
                          color="error"
                          size="small"
                          sx={{ fontSize: "0.65rem", height: 20 }}
                        />
                      ) : isPending && m.report_count > 0 ? (
                        <Chip
                          label="Reported"
                          color="warning"
                          size="small"
                          sx={{ fontSize: "0.65rem", height: 20 }}
                        />
                      ) : isPending ? (
                        <Chip
                          label="Playing"
                          color={isMyRow ? "default" : "primary"}
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
                  <TableCell colSpan={5} sx={{ textAlign: "center", color: "text.disabled", py: 3 }}>
                    No pairings for this round yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Box textAlign="center" mt={2}>
        <Typography variant="caption" color="text.disabled">Updates automatically</Typography>
      </Box>

      <DeckPickerDialog
        open={deckPickerOpen}
        onClose={() => setDeckPickerOpen(false)}
        initialPokemon1={viewData?.player.deck_pokemon1 ?? null}
        initialPokemon2={viewData?.player.deck_pokemon2 ?? null}
        onSave={handleSaveDeck}
      />
    </Box>
  );
};

export default PlayerTournamentView;
