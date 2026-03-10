import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
} from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  WorkspacesOutlined as WorkspaceIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Menu as MenuIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
} from "@mui/icons-material";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";
import { useThemeMode } from "../ThemeContext";

const Header: React.FC = () => {
  const { user, logout, displayName } = useAuth();
  const { workspace, workspaces, lastWorkspace, wPath } = useWorkspace();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const [wsMenuAnchor, setWsMenuAnchor] = useState<null | HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeWorkspace = workspace ?? lastWorkspace;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleNavClick = (to: string) => {
    navigate(to);
    setDrawerOpen(false);
  };

  const homeHref = activeWorkspace ? wPath("/tournaments") : "/dashboard";

  const ThemeToggle = () => (
    <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      <IconButton
        color="inherit"
        onClick={toggleTheme}
        aria-label="Toggle light/dark mode"
        size="small"
        sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
      >
        {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );

  return (
    <AppBar position="static">
      <Toolbar>
        {/* ── Logo ──────────────────────────────────────────────── */}
        <Box
          component={RouterLink}
          to={user ? homeHref : "/"}
          sx={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
            mr: 1,
          }}
        >
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Go to home"
            sx={{ mr: 0.5 }}
          >
            <TournamentIcon />
          </IconButton>
          <Typography
            variant="h6"
            component="div"
            sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}
          >
            Matchamp
          </Typography>
        </Box>

        {/* ── Workspace switcher chip ────────────────────────────── */}
        {activeWorkspace && (
          <>
            <Chip
              icon={<WorkspaceIcon />}
              label={activeWorkspace.name}
              deleteIcon={<ArrowDropDownIcon />}
              onDelete={(e) => setWsMenuAnchor(e.currentTarget as HTMLElement)}
              onClick={(e) => setWsMenuAnchor(e.currentTarget)}
              size="small"
              sx={{
                ml: 1.5,
                color: "inherit",
                borderColor: "rgba(255,255,255,0.25)",
                cursor: "pointer",
                "& .MuiChip-icon": { color: "rgba(255,255,255,0.6)" },
                "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.5)" },
                "&:hover": { borderColor: "rgba(255,255,255,0.5)" },
              }}
              variant="outlined"
            />
            <Menu
              anchorEl={wsMenuAnchor}
              open={Boolean(wsMenuAnchor)}
              onClose={() => setWsMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
            >
              {workspaces.map((ws) => (
                <MenuItem
                  key={ws.id}
                  selected={ws.id === activeWorkspace?.id}
                  onClick={() => {
                    navigate(`/w/${ws.slug}/tournaments`);
                    setWsMenuAnchor(null);
                  }}
                >
                  {ws.name}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                onClick={() => {
                  navigate("/workspaces/new");
                  setWsMenuAnchor(null);
                }}
              >
                + New workspace
              </MenuItem>
            </Menu>
          </>
        )}

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* ── Nav ───────────────────────────────────────────────── */}
        {user ? (
          <>
            {/* Desktop nav */}
            <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1, alignItems: "center" }}>
              <Button
                color="inherit"
                component={RouterLink}
                to={wPath("/dashboard")}
                sx={{ textTransform: "none", opacity: 0.8, "&:hover": { opacity: 1 } }}
              >
                Dashboard
              </Button>
              <Button
                color="inherit"
                component={RouterLink}
                to={wPath("/tournaments")}
                sx={{ textTransform: "none", opacity: 0.8, "&:hover": { opacity: 1 } }}
              >
                Tournaments
              </Button>
              <Button
                color="inherit"
                component={RouterLink}
                to="/me"
                sx={{ textTransform: "none", opacity: 0.8, "&:hover": { opacity: 1 } }}
              >
                My Profile
              </Button>
              <Button
                color="inherit"
                component={RouterLink}
                to="/whats-new"
                sx={{ textTransform: "none", opacity: 0.8, "&:hover": { opacity: 1 } }}
              >
                What&apos;s New
              </Button>
              <Button
                variant="contained"
                color="primary"
                sx={{ textTransform: "none", fontWeight: 600, ml: 1, borderRadius: "8px" }}
                onClick={() => navigate(wPath("/tournaments"), { state: { openCreate: true } })}
              >
                Create Tournament
              </Button>
              <Typography
                variant="body2"
                sx={{ ml: 1.5, opacity: 0.6, fontSize: "0.85rem" }}
              >
                {displayName}
              </Typography>
              <ThemeToggle />
              <Button
                color="inherit"
                onClick={handleLogout}
                sx={{ textTransform: "none", opacity: 0.6, "&:hover": { opacity: 1 } }}
              >
                Logout
              </Button>
            </Box>

            {/* Mobile hamburger */}
            <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", gap: 0.5 }}>
              <ThemeToggle />
              <IconButton
                color="inherit"
                aria-label="Open navigation menu"
                onClick={() => setDrawerOpen(true)}
              >
                <MenuIcon />
              </IconButton>
            </Box>

            {/* Mobile drawer */}
            <Drawer
              anchor="right"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            >
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
                    <ListItemButton onClick={() => handleNavClick(wPath("/tournaments"))}>
                      <ListItemText primary="Tournaments" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleNavClick("/me")}>
                      <ListItemText primary="My Profile" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleNavClick("/whats-new")}>
                      <ListItemText primary="What's New" />
                    </ListItemButton>
                  </ListItem>
                  <Divider sx={{ my: 1 }} />
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => {
                        setDrawerOpen(false);
                        navigate(wPath("/tournaments"), { state: { openCreate: true } });
                      }}
                    >
                      <ListItemText primary="Create Tournament" />
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
          /* Unauthenticated — shown on landing page and auth pages */
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <ThemeToggle />
            <Button
              color="inherit"
              component={RouterLink}
              to="/login"
              sx={{ textTransform: "none", opacity: 0.8, "&:hover": { opacity: 1 } }}
            >
              Log in
            </Button>
            <Button
              variant="contained"
              color="primary"
              component={RouterLink}
              to="/register"
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: "8px" }}
            >
              Sign up
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
