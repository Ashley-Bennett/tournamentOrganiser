import React, { useState, useEffect, useCallback } from "react";
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
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";
import { useAuth } from "../AuthContext";
import { TournamentSummary } from "../types/tournament";
import { formatDate } from "../utils/format";
import DeviceTournaments from "./DeviceTournaments";

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

  const fetchDashboard = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceLoading) void fetchDashboard();
  }, [workspaceLoading, fetchDashboard]);

  const isLoading = workspaceLoading || loading;

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

  return (
    <Box>
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
      {activeView === "player" && <DeviceTournaments embedded />}
    </Box>
  );
};

export default Dashboard;
