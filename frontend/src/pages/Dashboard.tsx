import React, { useState, useEffect, useCallback } from "react";
import { Grid, Card, CardContent, Typography, Box, Paper } from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
} from "@mui/icons-material";
import { apiCall, handleApiError } from "../utils/api";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import PageLoading from "../components/PageLoading";

interface Tournament {
  id: number;
  name: string;
  date: string;
  league_name?: string;
  bracket_type: string;
  status: "new" | "active" | "completed";
  created_at: string;
  updated_at?: string;
}

interface DashboardStats {
  activeTournaments: number;
  totalParticipants: number;
  completedTournaments: number;
}

const Dashboard: React.FC = () => {
  const handleUnauthorized = useAuthRedirect();
  const [stats, setStats] = useState<DashboardStats>({
    activeTournaments: 0,
    totalParticipants: 0,
    completedTournaments: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchDashboardStats = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch tournaments
      const tournamentsResponse = await apiCall("/api/tournaments");
      if (handleUnauthorized(tournamentsResponse)) return;
      if (!tournamentsResponse.ok) {
        await handleApiError(tournamentsResponse);
      }
      const tournaments: Tournament[] = await tournamentsResponse.json();

      // Calculate statistics
      const activeTournaments = tournaments.filter(
        (t) => t.status === "active",
      ).length;
      const completedTournaments = tournaments.filter(
        (t) => t.status === "completed",
      ).length;

      // Fetch total participants (players across all tournaments)
      let totalParticipants = 0;
      for (const tournament of tournaments) {
        const playersResponse = await apiCall(
          `/api/tournaments/${tournament.id}/players`,
        );
        if (playersResponse.ok) {
          const players = await playersResponse.json();
          totalParticipants += players.length;
        }
      }

      setStats({
        activeTournaments,
        totalParticipants,
        completedTournaments,
      });
    } catch (error: unknown) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  if (loading) {
    return <PageLoading />;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TournamentIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Active Tournaments</Typography>
              </Box>
              <Typography variant="h3" color="primary">
                {stats.activeTournaments}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.activeTournaments === 0
                  ? "No tournaments currently active"
                  : `${stats.activeTournaments} tournament${
                      stats.activeTournaments === 1 ? "" : "s"
                    } in progress`}
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
              <Typography variant="h3" color="secondary">
                {stats.totalParticipants}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.totalParticipants === 0
                  ? "No participants registered"
                  : `${stats.totalParticipants} participant${
                      stats.totalParticipants === 1 ? "" : "s"
                    } across all tournaments`}
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
              <Typography variant="h3" color="warning.main">
                {stats.completedTournaments}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.completedTournaments === 0
                  ? "No tournaments completed yet"
                  : `${stats.completedTournaments} tournament${
                      stats.completedTournaments === 1 ? "" : "s"
                    } completed`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Welcome to Matchamp
            </Typography>
            <Typography variant="body1" paragraph>
              This is your tournament management dashboard. Here you can:
            </Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Typography component="li" variant="body1">
                Create and manage tournaments
              </Typography>
              <Typography component="li" variant="body1">
                Register participants
              </Typography>
              <Typography component="li" variant="body1">
                Track matches and results
              </Typography>
              <Typography component="li" variant="body1">
                Generate brackets and schedules
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
