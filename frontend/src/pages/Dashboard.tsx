import React from "react";
import { Grid, Card, CardContent, Typography, Box, Paper } from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  People as PeopleIcon,
  EmojiEvents as TrophyIcon,
} from "@mui/icons-material";

const Dashboard: React.FC = () => {
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
                0
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No tournaments currently active
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
                0
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No participants registered
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
                0
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No tournaments completed yet
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Welcome to Tournament Organiser
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
