import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Typography,
  Stack,
  IconButton,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
} from "@mui/material";
import {
  Menu as MenuIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
} from "@mui/icons-material";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { useThemeMode } from "../ThemeContext";

const BORDER = "rgba(255,255,255,0.08)";
const TEXT_MUTED = "rgba(255,255,255,0.6)";
const ACCENT = "#dc004e";

const Header: React.FC = () => {
  const { user, displayName, logout } = useAuth();
  const { wPath } = useWorkspace();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleNavClick = (to: string) => {
    navigate(to);
    setDrawerOpen(false);
  };

  const homeHref = user ? wPath("/dashboard") : "/";

  const navBtnSx = {
    color: TEXT_MUTED,
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.95rem",
    "&:hover": { color: "white", bgcolor: "transparent" },
  };

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        backdropFilter: "blur(12px)",
        bgcolor: "rgba(6,14,29,0.88)",
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ py: 1.5 }}
        >
          {/* ── Logo ─────────────────────────────────────── */}
          <Box component={RouterLink} to={homeHref} sx={{ textDecoration: "none" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "white",
                fontSize: "1.2rem",
              }}
            >
              Matchamp
            </Typography>
          </Box>

          {/* ── Right side ──────────────────────────────── */}
          {user ? (
            <>
              {/* Desktop */}
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{ display: { xs: "none", sm: "flex" } }}
              >
                <Button component={RouterLink} to={wPath("/dashboard")} sx={navBtnSx}>
                  Dashboard
                </Button>
                <Button component={RouterLink} to="/me" sx={navBtnSx}>
                  Account
                </Button>
                <Button component={RouterLink} to="/whats-new" sx={navBtnSx}>
                  What&apos;s New
                </Button>
                <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                  <IconButton
                    onClick={toggleTheme}
                    size="small"
                    sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                  >
                    {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Button onClick={handleLogout} sx={navBtnSx}>
                  Logout
                </Button>
              </Stack>

              {/* Mobile */}
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ display: { xs: "flex", sm: "none" } }}>
                <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
                  <IconButton
                    onClick={toggleTheme}
                    size="small"
                    sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                  >
                    {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <IconButton
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu"
                  sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                >
                  <MenuIcon />
                </IconButton>
              </Stack>

              {/* Mobile drawer */}
              <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 260, pt: 2 }} role="navigation">
                  {displayName && (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1 }}>
                      {displayName}
                    </Typography>
                  )}
                  <Divider />
                  <List disablePadding>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick(wPath("/dashboard"))}>
                        <ListItemText primary="Dashboard" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/me")}>
                        <ListItemText primary="Account" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/whats-new")}>
                        <ListItemText primary="What's New" />
                      </ListItemButton>
                    </ListItem>
                    <Divider sx={{ my: 1 }} />
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => { handleLogout(); setDrawerOpen(false); }}>
                        <ListItemText primary="Logout" />
                      </ListItemButton>
                    </ListItem>
                  </List>
                </Box>
              </Drawer>
            </>
          ) : (
            /* Unauthenticated */
            <>
              {/* Desktop */}
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ display: { xs: "none", sm: "flex" } }}
              >
                <Button component={RouterLink} to="/my-tournaments" sx={navBtnSx}>
                  My Tournaments
                </Button>
                <Button component={RouterLink} to="/whats-new" sx={navBtnSx}>
                  What&apos;s New
                </Button>
                <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                  <IconButton
                    onClick={toggleTheme}
                    size="small"
                    sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                  >
                    {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Button component={RouterLink} to="/login" sx={navBtnSx}>
                  Log in
                </Button>
                <Button
                  component={RouterLink}
                  to="/register"
                  variant="contained"
                  sx={{
                    bgcolor: ACCENT,
                    "&:hover": { bgcolor: "#b8003f" },
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: "8px",
                    px: 2.5,
                    py: 0.75,
                  }}
                >
                  Sign up
                </Button>
              </Stack>

              {/* Mobile */}
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ display: { xs: "flex", sm: "none" } }}>
                <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
                  <IconButton
                    onClick={toggleTheme}
                    size="small"
                    sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                  >
                    {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <IconButton
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu"
                  sx={{ color: TEXT_MUTED, "&:hover": { color: "white" } }}
                >
                  <MenuIcon />
                </IconButton>
              </Stack>

              {/* Mobile drawer */}
              <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 260, pt: 2 }} role="navigation">
                  <List disablePadding>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/my-tournaments")}>
                        <ListItemText primary="My Tournaments" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/whats-new")}>
                        <ListItemText primary="What's New" />
                      </ListItemButton>
                    </ListItem>
                    <Divider sx={{ my: 1 }} />
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/login")}>
                        <ListItemText primary="Log in" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => handleNavClick("/register")}>
                        <ListItemText primary="Sign up" primaryTypographyProps={{ fontWeight: 600, color: ACCENT }} />
                      </ListItemButton>
                    </ListItem>
                  </List>
                </Box>
              </Drawer>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default Header;
