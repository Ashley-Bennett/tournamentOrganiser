import React, { useState, useEffect, useCallback } from "react";
import { Grid, Card, CardContent, Typography, Box, Paper, Skeleton, Alert, Button } from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useWorkspace } from "../WorkspaceContext";

interface DashboardStats {
  activeTournaments: number;
  totalParticipants: number;
  completedTournaments: number;
}

const Dashboard: React.FC = () => {
  const { workspaceId, wPath, loading: workspaceLoading } = useWorkspace();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    activeTournaments: 0,
    totalParticipants: 0,
    completedTournaments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: tournaments, error: tErr } = await supabase
        .from("tournaments")
        .select("id, status")
        .eq("workspace_id", workspaceId);

      if (tErr) throw tErr;

      const activeTournaments = (tournaments ?? []).filter(
        (t) => t.status === "active",
      ).length;
      const completedTournaments = (tournaments ?? []).filter(
        (t) => t.status === "completed",
      ).length;

      const { count: totalParticipants, error: pErr } = await supabase
        .from("tournament_players")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);

      if (pErr) throw pErr;

      setStats({
        activeTournaments,
        totalParticipants: totalParticipants ?? 0,
        completedTournaments,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceLoading) {
      void fetchDashboardStats();
    }
  }, [workspaceLoading, fetchDashboardStats]);

  const isLoading = workspaceLoading || loading;

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TournamentIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Active Tournaments</Typography>
              </Box>
              {isLoading ? <Skeleton variant="text" width={60} height={60} /> : (
                <Typography variant="h3" color="primary">
                  {stats.activeTournaments}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {isLoading ? <Skeleton variant="text" width="80%" /> : (
                  stats.activeTournaments === 0
                    ? "No tournaments currently active"
                    : `${stats.activeTournaments} tournament${
                        stats.activeTournaments === 1 ? "" : "s"
                      } in progress`
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <PeopleIcon color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Participants</Typography>
              </Box>
              {isLoading ? <Skeleton variant="text" width={60} height={60} /> : (
                <Typography variant="h3" color="secondary">
                  {stats.totalParticipants}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {isLoading ? <Skeleton variant="text" width="80%" /> : (
                  stats.totalParticipants === 0
                    ? "No participants registered"
                    : `${stats.totalParticipants} participant${
                        stats.totalParticipants === 1 ? "" : "s"
                      } across all tournaments`
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TrophyIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">Completed Tournaments</Typography>
              </Box>
              {isLoading ? <Skeleton variant="text" width={60} height={60} /> : (
                <Typography variant="h3" color="warning.main">
                  {stats.completedTournaments}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {isLoading ? <Skeleton variant="text" width="80%" /> : (
                  stats.completedTournaments === 0
                    ? "No tournaments completed yet"
                    : `${stats.completedTournaments} tournament${
                        stats.completedTournaments === 1 ? "" : "s"
                      } completed`
                )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {!isLoading && stats.activeTournaments === 0 && stats.completedTournaments === 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 4, textAlign: "center" }}>
              <TrophyIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No tournaments yet
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Create your first tournament to get started. Add players, generate Swiss pairings, and track results.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddIcon />}
                onClick={() => navigate(wPath("/tournaments/create"))}
              >
                Create your first tournament
              </Button>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default Dashboard;
