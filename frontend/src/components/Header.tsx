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
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import {
  SportsEsports as TournamentIcon,
  WorkspacesOutlined as WorkspaceIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Menu as MenuIcon,
} from "@mui/icons-material";
import { useAuth } from "../AuthContext";
import { useWorkspace } from "../WorkspaceContext";

const Header: React.FC = () => {
  const { user, logout, displayName } = useAuth();
  const { workspace, workspaces, lastWorkspace, wPath } = useWorkspace();
  const navigate = useNavigate();
  const [wsMenuAnchor, setWsMenuAnchor] = useState<null | HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Use the last known workspace when not on a workspace-scoped URL (e.g. /me)
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

  return (
    <AppBar position="static">
      <Toolbar>
        {/* ── Logo ──────────────────────────────────────────────── */}
        <Box
          component={RouterLink}
          to={homeHref}
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
            aria-label="Go to dashboard"
            sx={{ mr: 1 }}
          >
            <TournamentIcon />
          </IconButton>
          <Typography variant="h6" component="div">
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
                ml: 1,
                color: "inherit",
                borderColor: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                "& .MuiChip-icon": { color: "inherit" },
                "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)" },
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
            <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 2, alignItems: "center" }}>
              <Button color="inherit" component={RouterLink} to={wPath("/dashboard")}>
                Dashboard
              </Button>
              <Button color="inherit" component={RouterLink} to={wPath("/tournaments")}>
                Tournaments
              </Button>
              <Button color="inherit" component={RouterLink} to="/me">
                My Profile
              </Button>
              <Tooltip title="Coming soon">
                <span>
                  <Button
                    color="inherit"
                    disabled
                    sx={{ "&.Mui-disabled": { color: "rgba(255,255,255,0.85)", opacity: 1 } }}
                  >
                    Leagues
                  </Button>
                </span>
              </Tooltip>
              <Button
                color="inherit"
                component={RouterLink}
                to={wPath("/tournaments/create")}
                variant="outlined"
                sx={{ color: "white", borderColor: "white" }}
              >
                Create Tournament
              </Button>
              <Typography variant="body1" sx={{ ml: 2 }}>
                {displayName}
              </Typography>
              <Button color="inherit" onClick={handleLogout}>
                Logout
              </Button>
            </Box>

            {/* Mobile hamburger */}
            <IconButton
              color="inherit"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              sx={{ display: { xs: "flex", sm: "none" } }}
            >
              <MenuIcon />
            </IconButton>

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
                    <ListItemButton disabled>
                      <ListItemText primary="Leagues" secondary="Coming soon" />
                    </ListItemButton>
                  </ListItem>
                  <Divider sx={{ my: 1 }} />
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleNavClick(wPath("/tournaments/create"))}>
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
