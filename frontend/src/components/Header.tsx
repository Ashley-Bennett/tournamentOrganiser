import React from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
} from "@mui/material";
import { SportsEsports as TournamentIcon } from "@mui/icons-material";
import { useAuth } from "../AuthContext";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/");
  };
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
        {user ? (
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Button color="inherit" component={RouterLink} to="/dashboard">
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
            <Typography variant="body1" sx={{ ml: 2 }}>
              {user.name}
            </Typography>
            <Button color="inherit" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button color="inherit" component={RouterLink} to="/login">
              Login
            </Button>
            <Button color="inherit" component={RouterLink} to="/register">
              Register
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
