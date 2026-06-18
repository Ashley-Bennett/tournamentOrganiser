import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
  Button,
  Chip,
  ChipProps,
  Skeleton,
  Alert,
  Divider,
  Stack,
  Tab,
  Tabs,
} from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
  Add as AddIcon,
  OpenInNew as OpenInNewIcon,
  PlayArrow as ResumeIcon,
  Ballot as TotalIcon,
  WorkspacePremium as WinIcon,
  ShowChart as WinRateIcon,
  Style as DeckIcon,
} from "@mui/icons-material";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";
import { useAuth } from "../AuthContext";
import { TournamentSummary } from "../types/tournament";
import { formatDate } from "../utils/format";
import { getAllEntries } from "../utils/playerStorage";
import { getSpriteUrl } from "../utils/pokemonCache";
import NormalizedSprite from "../components/NormalizedSprite";

type View = "organiser" | "player";

const TABS: Record<View, { label: string; view: View }[]> = {
  organiser: [
    { label: "Organising", view: "organiser" },
    { label: "Playing", view: "player" },
  ],
  player: [
    { label: "Playing", view: "player" },
    { label: "Organising", view: "organiser" },
  ],
};

function viewModeKey(userId: string) {
  return `matchamp_view_mode_${userId}`;
}

interface DashboardStats {
  activeTournaments: number;
  totalParticipants: number;
  completedTournaments: number;
  totalTournaments: number;
}

function statusColor(status: string): ChipProps["color"] {
  switch (status) {
    case "completed": return "success";
    case "active": return "warning";
    case "draft": return "info";
    default: return "default";
  }
}

function statusLabel(status: string) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "";
}

function typeLabel(type: string) {
  return type === "single_elimination" ? "Single Elim" : "Swiss";
}

const OrganiserDashboard: React.FC = () => {
  const { workspaceId, wPath, loading: workspaceLoading } = useWorkspace();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>({
    activeTournaments: 0,
    totalParticipants: 0,
    completedTournaments: 0,
    totalTournaments: 0,
  });
  const [recentTournaments, setRecentTournaments] = useState<TournamentSummary[]>([]);
  const [activeTournament, setActiveTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const fetchDashboard = useCallback(async () => {
    if (!workspaceId) return;
    const isInitialLoad = !initialLoadDoneRef.current;
    try {
      if (isInitialLoad) setLoading(true);
      setError(null);

      const [{ data: tournaments, error: tErr }, { count: totalParticipants, error: pErr }] =
        await Promise.all([
          supabase
            .from("tournaments")
            .select("id, name, status, tournament_type, created_at, created_by, current_round_started_at")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false }),
          supabase
            .from("tournament_players")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId),
        ]);

      if (tErr) throw tErr;
      if (pErr) throw pErr;

      const all = tournaments ?? [];
      const active = all.filter((t) => t.status === "active");
      const completed = all.filter((t) => t.status === "completed");

      const spotlight = active.sort((a, b) => {
        const aTime = a.current_round_started_at ?? a.created_at;
        const bTime = b.current_round_started_at ?? b.created_at;
        return bTime.localeCompare(aTime);
      })[0] ?? null;

      setActiveTournament(spotlight);
      setRecentTournaments(all.slice(0, 5));
      setStats({
        activeTournaments: active.length,
        totalParticipants: totalParticipants ?? 0,
        completedTournaments: completed.length,
        totalTournaments: all.length,
      });
      initialLoadDoneRef.current = true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceLoading) void fetchDashboard();
  }, [workspaceLoading, fetchDashboard]);

  const isLoading = loading;

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate(wPath("/tournaments"), { state: { openCreate: true } })}
          >
            Create Tournament
          </Button>
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon />}
            onClick={() => navigate(wPath("/tournaments"))}
          >
            All Tournaments
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {(isLoading || activeTournament) && (
        <Box mb={3}>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Active Tournament
          </Typography>
          {isLoading ? (
            <Skeleton variant="rounded" height={96} />
          ) : activeTournament ? (
            <Card
              sx={{
                border: 2,
                borderColor: "warning.main",
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255,167,38,0.08)"
                    : "rgba(255,167,38,0.06)",
              }}
            >
              <CardActionArea onClick={() => navigate(wPath(`/tournaments/${activeTournament.id}`))}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <ResumeIcon color="warning" />
                      <Box>
                        <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                          {activeTournament.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {typeLabel(activeTournament.tournament_type)} · Started {formatDate(activeTournament.created_at)}
                        </Typography>
                      </Box>
                    </Box>
                    <Chip label="Active" color="warning" size="small" />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ) : null}
        </Box>
      )}

      <Box mb={3}>
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          Recent Tournaments
        </Typography>
        <Card variant="outlined">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Box key={i} px={2} py={1.5}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="30%" />
                {i < 3 && <Divider sx={{ mt: 1.5 }} />}
              </Box>
            ))
          ) : recentTournaments.length === 0 ? (
            <Box px={2} py={3} textAlign="center">
              <Typography variant="body2" color="text.secondary">
                No tournaments yet — create one to get started.
              </Typography>
            </Box>
          ) : (
            recentTournaments.map((t, i) => (
              <React.Fragment key={t.id}>
                <CardActionArea onClick={() => navigate(wPath(`/tournaments/${t.id}`))}>
                  <Box px={2} py={1.5} display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                    <Box minWidth={0}>
                      <Typography variant="body1" fontWeight="medium" noWrap>
                        {t.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {typeLabel(t.tournament_type)} · {formatDate(t.created_at)}
                      </Typography>
                    </Box>
                    <Chip label={statusLabel(t.status)} color={statusColor(t.status)} size="small" sx={{ flexShrink: 0 }} />
                  </Box>
                </CardActionArea>
                {i < recentTournaments.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </Card>
      </Box>

      <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Stats
      </Typography>
      <Grid container spacing={2}>
        {[
          {
            label: "Total Tournaments",
            value: stats.totalTournaments,
            icon: <TotalIcon />,
            color: "text.primary" as const,
          },
          {
            label: "Active",
            value: stats.activeTournaments,
            icon: <TournamentIcon color="warning" />,
            color: "warning.main" as const,
            onClick: () => navigate(wPath("/tournaments"), { state: { filterStatus: "active" } }),
          },
          {
            label: "Completed",
            value: stats.completedTournaments,
            icon: <TrophyIcon color="success" />,
            color: "success.main" as const,
            onClick: () => navigate(wPath("/tournaments"), { state: { filterStatus: "completed" } }),
          },
          {
            label: "Total Participants",
            value: stats.totalParticipants,
            icon: <PeopleIcon color="secondary" />,
            color: "secondary.main" as const,
          },
        ].map(({ label, value, icon, color, onClick }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card
              variant="outlined"
              sx={{ height: "100%", cursor: onClick ? "pointer" : "default" }}
              onClick={onClick}
            >
              <CardContent sx={{ pb: "16px !important" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  {icon}
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                </Box>
                {isLoading ? (
                  <Skeleton variant="text" width={48} height={44} />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color={color}>
                    {value}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}

interface DbEntry {
  tournament_player_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  workspace_name: string;
  player_name: string;
  joined_at: string;
  player_position: number | null;
  total_players: number | null;
  match_wins: number;
  total_matches: number;
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

interface PlayerTournamentSummary {
  tournament_id: string;
  tournament_name: string;
  workspace_name: string;
  status: string;
  player_position: number | null;
  total_players: number | null;
  deck_pokemon1: number | null;
  deck_pokemon2: number | null;
}

interface PlayerRow {
  tournamentId: string;
  tournamentName: string;
  workspaceName: string | null;
  status: string | null;
  playerPosition: number | null;
  totalPlayers: number | null;
  joinedAt: string | null;
  matchWins: number;
  totalMatches: number;
  isLinked: boolean;
  playerId?: string;
  deviceToken?: string;
  deckPokemon1: number | null;
  deckPokemon2: number | null;
}

const PlayerDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const deviceEntries = useMemo(() => getAllEntries(), []);

  const [dbEntries, setDbEntries] = useState<DbEntry[]>([]);
  const [summaries, setSummaries] = useState<PlayerTournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(async () => {
    const isInitialLoad = !initialLoadDoneRef.current;
    if (isInitialLoad) setLoading(true);
    setError(null);
    const [entriesResult, summariesResult] = await Promise.all([
      user
        ? supabase.rpc("get_my_player_entries")
        : Promise.resolve({ data: [], error: null }),
      deviceEntries.length > 0
        ? supabase.rpc("get_tournaments_summary", {
            p_tournament_ids: deviceEntries.map((e) => e.tournamentId),
            p_player_ids: deviceEntries.map((e) => e.playerId),
          })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (entriesResult.error) {
      setError(entriesResult.error.message);
    } else if (summariesResult.error) {
      setError(summariesResult.error.message);
    } else {
      setDbEntries((entriesResult.data as DbEntry[]) ?? []);
      setSummaries((summariesResult.data as PlayerTournamentSummary[]) ?? []);
      initialLoadDoneRef.current = true;
    }
    if (isInitialLoad) setLoading(false);
  }, [user, deviceEntries]);

  useEffect(() => { void load(); }, [load]);

  const linkedIds = useMemo(() => new Set(dbEntries.map((e) => e.tournament_id)), [dbEntries]);

  const rows = useMemo((): PlayerRow[] => {
    const dbRows: PlayerRow[] = dbEntries.map((e) => ({
      tournamentId: e.tournament_id,
      tournamentName: e.tournament_name,
      workspaceName: e.workspace_name,
      status: e.tournament_status,
      playerPosition: e.player_position ?? null,
      totalPlayers: e.total_players ?? null,
      joinedAt: e.joined_at,
      matchWins: e.match_wins,
      totalMatches: e.total_matches,
      isLinked: true,
      deckPokemon1: e.deck_pokemon1 ?? null,
      deckPokemon2: e.deck_pokemon2 ?? null,
    }));
    const deviceRows: PlayerRow[] = deviceEntries.flatMap((e) => {
      if (linkedIds.has(e.tournamentId)) return [];
      const summary = summaries.find((s) => s.tournament_id === e.tournamentId);
      if (!loading && !summary) return [];
      return [{
        tournamentId: e.tournamentId,
        tournamentName: summary?.tournament_name ?? e.tournamentName ?? "Tournament",
        workspaceName: summary?.workspace_name ?? null,
        status: summary?.status ?? null,
        playerPosition: summary?.player_position ?? null,
        totalPlayers: summary?.total_players ?? null,
        joinedAt: e.joinedAt,
        matchWins: 0,
        totalMatches: 0,
        isLinked: false,
        playerId: e.playerId,
        deviceToken: e.deviceToken,
        deckPokemon1: summary?.deck_pokemon1 ?? null,
        deckPokemon2: summary?.deck_pokemon2 ?? null,
      }];
    });
    return [...dbRows, ...deviceRows].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return 0;
    });
  }, [dbEntries, deviceEntries, summaries, linkedIds, loading]);

  const activeRow = rows.find((r) => r.status === "active") ?? null;
  const recentRows = useMemo(() =>
    [...rows]
      .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""))
      .slice(0, 5),
    [rows],
  );
  const completedRows = rows.filter((r) => r.status === "completed");
  const totalCompleted = completedRows.length;
  const totalWins = completedRows.filter((r) => r.playerPosition === 1).length;
  const allMatchWins = rows.reduce((sum, r) => sum + r.matchWins, 0);
  const allTotalMatches = rows.reduce((sum, r) => sum + r.totalMatches, 0);
  const winRate = allTotalMatches > 0 ? parseFloat(((allMatchWins / allTotalMatches) * 100).toFixed(1)) : null;

  const favDeck = useMemo(() => {
    const counts = new Map<string, { count: number; p1: number | null; p2: number | null }>();
    for (const row of rows) {
      if (row.deckPokemon1 == null && row.deckPokemon2 == null) continue;
      const key = `${row.deckPokemon1 ?? ""}_${row.deckPokemon2 ?? ""}`;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { count: 1, p1: row.deckPokemon1, p2: row.deckPokemon2 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [rows]);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={Link}
            to="/join"
          >
            Join Tournament
          </Button>
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon />}
            onClick={() => navigate("/my-tournaments")}
          >
            All My Tournaments
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {!user && deviceEntries.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Box display="flex" gap={1} alignItems="center" flexShrink={0}>
              <Button component={Link} to="/register" size="small" color="inherit" variant="outlined">Sign up</Button>
              <Button component={Link} to="/login" size="small" color="inherit">Log in</Button>
            </Box>
          }
        >
          This history is saved on this device only. Sign up to keep it forever.
        </Alert>
      )}


      {/* Active tournament spotlight */}
      {(loading || activeRow) && (
        <Box mb={3}>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Active Tournament
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" height={96} />
          ) : activeRow ? (
            <Card
              sx={{
                border: 2,
                borderColor: "success.main",
                background: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(102,187,106,0.08)"
                    : "rgba(102,187,106,0.06)",
              }}
            >
              <CardActionArea
                onClick={() => navigate(`/t/${activeRow.tournamentId}/me`)}
              >
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <ResumeIcon color="success" />
                      <Box>
                        <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                          {activeRow.tournamentName}
                        </Typography>
                        {activeRow.workspaceName && (
                          <Typography variant="body2" color="text.secondary">
                            {activeRow.workspaceName}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Chip label="Active" color="success" size="small" />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ) : null}
        </Box>
      )}

      {/* Recent tournaments */}
      <Box mb={3}>
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          Recent Tournaments
        </Typography>
        <Card variant="outlined">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Box key={i} px={2} py={1.5}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="30%" />
                {i < 3 && <Divider sx={{ mt: 1.5 }} />}
              </Box>
            ))
          ) : recentRows.length === 0 ? (
            <Box px={2} py={3} textAlign="center">
              <Typography variant="body2" color="text.secondary">
                No tournaments yet — scan a QR code or enter a join code to get started.
              </Typography>
            </Box>
          ) : (
            recentRows.map((row, i) => {
              const isCompleted = row.status === "completed";
              const hasPosition = isCompleted && row.playerPosition != null && row.totalPlayers != null;
              return (
                <React.Fragment key={row.tournamentId}>
                  <CardActionArea
                    onClick={() => navigate(`/t/${row.tournamentId}/me`)}
                  >
                    <Box px={2} py={1.5} display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                      <Box minWidth={0}>
                        <Typography variant="body1" fontWeight="medium" noWrap>
                          {row.tournamentName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.workspaceName ?? ""}
                          {hasPosition ? ` · ${row.playerPosition}${ordinal(row.playerPosition!)} of ${row.totalPlayers}` : ""}
                        </Typography>
                      </Box>
                      {row.status && (
                        <Chip
                          label={row.status}
                          size="small"
                          color={row.status === "active" ? "success" : "default"}
                          variant={row.status === "active" ? "filled" : "outlined"}
                          sx={{ flexShrink: 0 }}
                        />
                      )}
                    </Box>
                  </CardActionArea>
                  {i < recentRows.length - 1 && <Divider />}
                </React.Fragment>
              );
            })
          )}
        </Card>
      </Box>

      {/* Stats */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="overline" color="text.secondary">
          Stats
        </Typography>
        <Button component={Link} to="/stats" size="small" variant="text" color="primary">
          View full stats
        </Button>
      </Box>
      <Grid container spacing={2}>
        {([
          {
            label: "Completed",
            value: String(totalCompleted),
            icon: <TrophyIcon color="success" />,
            color: "success.main" as const,
          },
          {
            label: "Won",
            value: String(totalWins),
            icon: <WinIcon color="warning" />,
            color: "warning.main" as const,
          },
          {
            label: "Win Rate",
            value: winRate != null ? `${winRate}%` : "—",
            icon: <WinRateIcon color="info" />,
            color: winRate != null ? "info.main" as const : "text.disabled" as const,
          },
        ] as const).map(({ label, value, icon, color }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ pb: "16px !important" }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  {icon}
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                </Box>
                {loading ? (
                  <Skeleton variant="text" width={48} height={44} />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color={color}>{value}</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
        <Grid item xs={6} sm={3}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ pb: "16px !important" }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <DeckIcon color="secondary" />
                <Typography variant="body2" color="text.secondary">Favourite Deck</Typography>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={72} height={44} />
              ) : favDeck ? (
                <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                  {favDeck.p1 != null && (
                    <NormalizedSprite src={getSpriteUrl(favDeck.p1)} size={40} />
                  )}
                  {favDeck.p2 != null && (
                    <NormalizedSprite src={getSpriteUrl(favDeck.p2)} size={40} />
                  )}
                </Box>
              ) : (
                <Typography variant="h4" fontWeight="bold" color="text.disabled">—</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const Dashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const intent: View = profile?.onboarding_intent ?? "organiser";
  const tabs = TABS[intent];

  const [activeView, setActiveView] = useState<View>(intent);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (initialised || profile === undefined) return;
    const stored = user ? localStorage.getItem(viewModeKey(user.id)) : null;
    setActiveView(stored === "player" || stored === "organiser" ? stored : intent);
    setInitialised(true);
  }, [user, profile, initialised, intent]);

  useEffect(() => {
    if (!initialised) return;
    setActiveView(intent);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (_: React.SyntheticEvent, newIndex: number) => {
    const view = tabs[newIndex].view;
    setActiveView(view);
    if (user) localStorage.setItem(viewModeKey(user.id), view);
  };

  const tabIndex = tabs.findIndex((t) => t.view === activeView);
  const currentTabIndex = tabIndex === -1 ? 0 : tabIndex;

  const name = profile?.display_name ?? user?.email?.split("@")[0] ?? null;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        {getGreeting()}{name ? `, ${name}` : ""}
      </Typography>
      <Tabs
        value={currentTabIndex}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {tabs.map((t) => (
          <Tab key={t.view} label={t.label} />
        ))}
      </Tabs>

      {activeView === "organiser" && <OrganiserDashboard />}
      {activeView === "player" && <PlayerDashboard />}
    </Box>
  );
};

export default Dashboard;
