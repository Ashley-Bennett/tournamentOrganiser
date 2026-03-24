import React, { useEffect, useRef, useState, useMemo } from "react";
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
  Alert,
  Chip,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { supabase } from "../supabaseClient";
import { sortByTieBreakers } from "../utils/tieBreaking";
import { buildStandingsFromMatches } from "../utils/tournamentUtils";
import StandingsTable from "../components/StandingsTable";
import RoundTimer from "../components/RoundTimer";

interface Tournament {
  id: string;
  name: string;
  status: string;
  num_rounds: number | null;
  is_public: boolean;
  round_duration_minutes?: number | null;
  current_round_started_at?: string | null;
  round_elapsed_seconds?: number | null;
  round_is_paused?: boolean | null;
  round_note?: string | null;
}

interface Player {
  id: string;
  name: string;
  dropped: boolean;
  dropped_at_round: number | null;
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
  // Handles two routes:
  //   /public/t/:publicSlug           — unauthenticated, is_public required
  //   /w/:workspaceSlug/tournaments/:id/pairings — authenticated workspace member
  const { publicSlug, id } = useParams<{ publicSlug?: string; id?: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | "standings">(1);
  const [timerExpanded, setTimerExpanded] = useState(false);
  const didInitRoundRef = useRef(false);
  const initialRoundsLoadedRef = useRef(false);
  const prevRoundCountRef = useRef(0);
  const prevTournamentStatusRef = useRef<string | null>(null);
  // Stores the resolved tournament ID so the realtime callback can ignore events
  // for other tournaments (the subscription has no server-side filter on public routes).
  const resolvedTournamentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!publicSlug && !id) {
      setError("Missing tournament link.");
      setLoading(false);
      return;
    }

    const load = async () => {
      let tData: Tournament | null = null;

      if (id) {
        // Authenticated route — workspace membership RLS handles access (any privacy).
        // Use maybeSingle() so an expired JWT (which causes RLS to silently return 0 rows)
        // yields null data rather than a 406 error.
        const { data, error: tErr } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, num_rounds, is_public, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note",
          )
          .eq("id", id)
          .maybeSingle();
        if (tErr || !data) {
          setError("Tournament not found or you do not have access.");
          setLoading(false);
          return;
        }
        tData = data;
      } else {
        // Public route — fetch by public_slug, is_public = true required
        const { data, error: tErr } = await supabase
          .from("tournaments")
          .select(
            "id, name, status, num_rounds, is_public, round_duration_minutes, current_round_started_at, round_elapsed_seconds, round_is_paused, round_note",
          )
          .eq("public_slug", publicSlug!)
          .eq("is_public", true)
          .single();
        if (tErr || !data) {
          setError(
            "This tournament is not available. It may be private or the link may be invalid.",
          );
          setLoading(false);
          return;
        }
        tData = data;
      }

      setTournament(tData);
      resolvedTournamentIdRef.current = tData.id;

      // Use the resolved tournament.id for child queries
      const tournamentId = tData.id;

      // Fetch players
      const { data: pData, error: pErr } = await supabase
        .from("tournament_players")
        .select("id, name, dropped, dropped_at_round")
        .eq("tournament_id", tournamentId);

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
        .eq("tournament_id", tournamentId)
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

      // Auto-select on first load only: standings for completed tournaments,
      // otherwise the current active round. Subsequent refreshes preserve the
      // user's manual selection.
      if (!didInitRoundRef.current) {
        didInitRoundRef.current = true;
        if (tData.status === "completed") {
          setSelectedRound("standings");
        } else if (enriched.length > 0) {
          const pendingRounds = enriched
            .filter(
              (m) =>
                m.status === "pending" ||
                (m.status === "ready" && m.pairings_published),
            )
            .map((m) => m.round_number);
          const allRounds = enriched.map((m) => m.round_number);
          const active =
            pendingRounds.length > 0
              ? Math.max(...pendingRounds)
              : Math.max(...allRounds);
          setSelectedRound(active);
        }
      }

      // Clear any previous error now that we've successfully loaded
      setError(null);
      setLoading(false);
    };

    setLoading(true);
    setError(null);
    void load();

    // Reload immediately when the tab becomes visible — browser timer throttling can
    // delay Supabase's proactive token refresh, causing expired JWTs and silent RLS
    // failures. Refreshing the session first ensures the next load() gets fresh data.
    // On the authenticated route, redirect to login if there's no recoverable session.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void supabase.auth.refreshSession().then(({ data: { session } }) => {
          if (!session && id) {
            navigate("/login", { replace: true });
            return;
          }
          void load();
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Lightweight fetch of just the three timer columns. Called by the realtime
    // subscription and by the polling interval so the timer freezes quickly on pause.
    const loadTimerState = async () => {
      const tid = resolvedTournamentIdRef.current;
      if (!tid) return;
      const { data } = await supabase
        .from("tournaments")
        .select(
          "current_round_started_at, round_elapsed_seconds, round_is_paused",
        )
        .eq("id", tid)
        .maybeSingle();
      if (!data) return;
      setTournament((prev) =>
        prev
          ? {
              ...prev,
              current_round_started_at: data.current_round_started_at ?? null,
              round_elapsed_seconds: data.round_elapsed_seconds ?? 0,
              round_is_paused: data.round_is_paused ?? false,
            }
          : prev,
      );
    };

    // Poll timer state every 2 s so pause/resume propagates even if the realtime
    // event is delayed or the tournaments table isn't in the publication yet.
    const timerPollId = setInterval(() => void loadTimerState(), 2_000);

    // Full data poll every 5 s as a fallback in case realtime events are missed
    // (e.g. publish pairings, round transitions). Realtime still fires instantly
    // when it works; this just ensures the page never stays stale.
    const dataPollId = setInterval(() => void load(), 5_000);

    // Real-time subscription so the page updates immediately when matches change.
    // Authenticated route: server-side filter keeps traffic minimal.
    // Public route: filter client-side via resolvedTournamentIdRef so we ignore
    // events from unrelated tournaments.
    const channel = supabase
      .channel(`pairings-${publicSlug ?? id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          ...(id ? { filter: `tournament_id=eq.${id}` } : {}),
        },
        (payload) => {
          if (!id && resolvedTournamentIdRef.current) {
            const row = (payload.new ?? payload.old) as {
              tournament_id?: string;
            } | null;
            if (row?.tournament_id !== resolvedTournamentIdRef.current) return;
          }
          void load();
        },
      )
      // Also watch the tournaments row for instant pause/resume (requires tournaments
      // table to be in the supabase_realtime publication — see migration 20260310010000).
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          ...(id ? { filter: `id=eq.${id}` } : {}),
        },
        (payload) => {
          if (!id && resolvedTournamentIdRef.current) {
            const row = payload.new as { id?: string } | null;
            if (row?.id !== resolvedTournamentIdRef.current) return;
          }
          const newRow = payload.new as {
            status?: string;
            round_is_paused?: boolean;
            current_round_started_at?: string | null;
            round_elapsed_seconds?: number;
          } | null;
          const oldRow = payload.old as {
            status?: string;
            round_is_paused?: boolean;
            current_round_started_at?: string | null;
            round_elapsed_seconds?: number;
          } | null;
          if (newRow?.status === "completed") {
            void load();
            setSelectedRound("standings");
          } else if (
            newRow?.status === oldRow?.status &&
            newRow?.round_is_paused !== oldRow?.round_is_paused
          ) {
            // Timer pause/resume only — fast path
            void loadTimerState();
          } else {
            // Any other tournament state change (round start, status update, etc.)
            void load();
          }
        },
      )
      .subscribe();

    return () => {
      clearInterval(timerPollId);
      clearInterval(dataPollId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [publicSlug, id]);

  const rounds = useMemo(
    () =>
      [...new Set(matches.map((m) => m.round_number))].sort((a, b) => a - b),
    [matches],
  );

  const tournamentStatus = tournament?.status ?? null;

  // Auto-switch to standings when the tournament completes
  useEffect(() => {
    if (
      tournamentStatus === "completed" &&
      prevTournamentStatusRef.current !== "completed"
    ) {
      setSelectedRound("standings");
    }
    prevTournamentStatusRef.current = tournamentStatus;
  }, [tournamentStatus]);

  // Auto-switch to a newly added round tab
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

  const roundMatches = useMemo(
    () =>
      typeof selectedRound === "number"
        ? matches
            .filter((m) => m.round_number === selectedRound)
            .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
        : [],
    [matches, selectedRound],
  );

  const droppedMap = useMemo(() => {
    const m = new Map<string, number | null>();
    players.forEach((p) => {
      if (p.dropped) m.set(p.id, p.dropped_at_round);
    });
    return m;
  }, [players]);

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

  // Pre-round: show large card grid when no real match activity has started yet.
  // Byes are auto-completed the moment the round begins, so we exclude them from this
  // check — a round with only byes should still show the large pairings board.
  const isPreRound =
    roundMatches.length > 0 &&
    !roundMatches.some(
      (m) => m.status === "pending" || m.status === "completed",
    );

  const isStandings = selectedRound === "standings";

  // Show the round timer when the round is actively in progress and a timer is configured.
  // Also show when paused (current_round_started_at is null but round_is_paused is true).
  const showTimer =
    !isPreRound &&
    !isStandings &&
    !!tournament.round_duration_minutes &&
    (!!tournament.current_round_started_at || !!tournament.round_is_paused) &&
    roundMatches.some((m) => m.status === "pending");

  const header = (
    <Box mb={isPreRound ? 2 : 1.5} textAlign="center">
      <Typography variant={isPreRound ? "h4" : "h5"} fontWeight={700}>
        {tournament.name}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {isStandings
          ? "Final Standings"
          : `${tournament.num_rounds ? `Round ${selectedRound} of ${tournament.num_rounds}` : `Round ${selectedRound}`}${!isPreRound && totalMatchCount > 0 ? ` · ${completedMatchCount}/${totalMatchCount} complete` : ""}`}
      </Typography>
    </Box>
  );

  const roundTabs = (rounds.length > 1 ||
    tournament.status === "completed") && (
    <Tabs
      value={selectedRound}
      onChange={(_e, v: number | "standings") => setSelectedRound(v)}
      variant="scrollable"
      scrollButtons="auto"
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
        Updates automatically
      </Typography>
    </Box>
  );

  // ── FINAL STANDINGS ─────────────────────────────────────────────────────────
  if (isStandings) {
    return (
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        {header}
        {roundTabs}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <StandingsTable standings={standings} droppedMap={droppedMap} />
        </Box>
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
        {tournament.round_note && (
          <Alert severity="info" sx={{ mb: 2, alignItems: "center" }}>
            <Typography variant="h6" fontWeight={400}>{tournament.round_note}</Typography>
          </Alert>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
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
  const pairingsTable = (
    <Paper
      variant="outlined"
      sx={{ flex: timerExpanded && showTimer ? 1 : undefined, minWidth: 0 }}
    >
      <Box px={2} py={1}>
        <Typography variant="subtitle2" fontWeight={600}>
          Pairings — Round {selectedRound}
        </Typography>
      </Box>
      <Divider />
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  width: 36,
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                }}
              >
                Table
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                }}
              >
                Player 1
              </TableCell>
              <TableCell
                sx={{
                  width: 24,
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "text.secondary",
                  px: 0,
                }}
              >
                vs
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                }}
              >
                Player 2
              </TableCell>
              <TableCell
                sx={{
                  width: 68,
                  textAlign: "right",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                }}
              >
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
                  <TableCell
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                    }}
                  >
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
                  <TableCell
                    sx={{
                      textAlign: "center",
                      color: "text.disabled",
                      fontSize: "0.75rem",
                      px: 0,
                    }}
                  >
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
  );

  return (
    <Box>
      {header}
      {roundTabs}

      {tournament.round_note && (
        <Alert severity="info" sx={{ mb: 1.5, alignItems: "center" }}>
          <Typography variant="h6" fontWeight={400}>{tournament.round_note}</Typography>
        </Alert>
      )}

      {/* Expanded layout: pairings and large timer side by side */}
      {showTimer && timerExpanded ? (
        <Box sx={{ display: "flex", gap: 2, alignItems: "stretch" }}>
          {pairingsTable}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              p: 1,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Tooltip title="Collapse timer">
                <IconButton
                  size="small"
                  onClick={() => setTimerExpanded(false)}
                >
                  <FullscreenExitIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flex: 1, display: "flex" }}>
              <RoundTimer
                startedAt={tournament.current_round_started_at ?? null}
                durationMinutes={tournament.round_duration_minutes!}
                elapsedSeconds={tournament.round_elapsed_seconds ?? 0}
                isPaused={tournament.round_is_paused ?? false}
                size="large"
              />
            </Box>
          </Paper>
        </Box>
      ) : (
        <>
          {pairingsTable}

          {/* Collapsed timer strip */}
          {showTimer && (
            <Paper
              variant="outlined"
              sx={{
                mt: 1,
                px: 2,
                py: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <RoundTimer
                startedAt={tournament.current_round_started_at ?? null}
                durationMinutes={tournament.round_duration_minutes!}
                elapsedSeconds={tournament.round_elapsed_seconds ?? 0}
                isPaused={tournament.round_is_paused ?? false}
                size="small"
              />
              <Tooltip title="Expand timer">
                <IconButton size="small" onClick={() => setTimerExpanded(true)}>
                  <FullscreenIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          )}
        </>
      )}

      {footer}
    </Box>
  );
};

export default TournamentPairings;
