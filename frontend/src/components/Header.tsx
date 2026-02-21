import React from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Tooltip,
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
        <Box
          component={RouterLink}
          to="/dashboard"
          sx={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
            mr: 2,
            flexGrow: 1,
          }}
        >
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Go to dashboard"
            sx={{ mr: 1 }}
          >
            <TournamentIcon />
          </IconButton>
          <Typography variant="h6" component="div">
            Matchamp
          </Typography>
        </Box>
        {user ? (
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Button color="inherit" component={RouterLink} to="/dashboard">
              Dashboard
            </Button>
            <Button color="inherit" component={RouterLink} to="/tournaments">
              Tournaments
            </Button>
            <Tooltip title="Coming soon">
              <span>
                <Button
                  color="inherit"
                  disabled
                  sx={{
                    "&.Mui-disabled": {
                      color: "rgba(255,255,255,0.85)",
                      opacity: 1,
                    },
                  }}
                >
                  Players
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Coming soon">
              <span>
                <Button
                  color="inherit"
                  disabled
                  sx={{
                    "&.Mui-disabled": {
                      color: "rgba(255,255,255,0.85)",
                      opacity: 1,
                    },
                  }}
                >
                  Leagues
                </Button>
              </span>
            </Tooltip>
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
              {(user.user_metadata?.name as string) || user.email || "User"}
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
