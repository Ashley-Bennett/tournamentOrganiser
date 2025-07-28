import React from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Typography,
  Button,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

const Tournaments: React.FC = () => {
  // Mock data - will be replaced with API calls
  const tournaments = [
    {
      id: 1,
      name: "Sample Tournament",
      description: "A sample tournament for testing",
      status: "pending",
      start_date: "2024-01-15",
      end_date: "2024-01-20",
      participants_count: 0,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "pending":
        return "warning";
      case "completed":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4" component="h1">
          Tournaments
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={RouterLink}
          to="/tournaments/create"
        >
          Create Tournament
        </Button>
      </Box>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Participants</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tournaments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No tournaments found. Create your first tournament!
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    <TableCell>{tournament.name}</TableCell>
                    <TableCell>{tournament.description}</TableCell>
                    <TableCell>
                      <Chip
                        label={tournament.status}
                        color={getStatusColor(tournament.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{tournament.start_date}</TableCell>
                    <TableCell>{tournament.end_date}</TableCell>
                    <TableCell>{tournament.participants_count}</TableCell>
                    <TableCell>
                      <Button size="small" color="primary">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default Tournaments;
