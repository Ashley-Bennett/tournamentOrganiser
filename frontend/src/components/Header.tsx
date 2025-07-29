import React from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
} from "@mui/material";
import { SportsEsports as TournamentIcon } from "@mui/icons-material";

const Header: React.FC = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          sx={{ mr: 2 }}
        >
          <TournamentIcon />
        </IconButton>

        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Matchamp
        </Typography>

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button color="inherit" component={RouterLink} to="/">
            Dashboard
          </Button>
          <Button color="inherit" component={RouterLink} to="/tournaments">
            Tournaments
          </Button>
          <Button color="inherit" component={RouterLink} to="/players">
            Players
          </Button>
          <Button color="inherit" component={RouterLink} to="/leagues">
            Leagues
          </Button>
          <Button
            color="inherit"
            component={RouterLink}
            to="/tournaments/create"
            variant="outlined"
            sx={{ color: "white", borderColor: "white" }}
          >
            Create Tournament
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
