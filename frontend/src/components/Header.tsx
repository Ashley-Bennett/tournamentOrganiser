import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Typography,
  Stack,
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
  WorkspacesOutlined as WorkspaceIcon,
  ArrowDropDown as ArrowDropDownIcon,
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
          {/* ── Logo ────────────────────────────────────── */}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box
              component={RouterLink}
              to={user ? homeHref : "/"}
              sx={{ textDecoration: "none" }}
            >
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

            {/* ── Workspace switcher ───────────────────── */}
            {activeWorkspace && (
              <>
                <Chip
                  icon={<WorkspaceIcon sx={{ fontSize: "0.95rem !important" }} />}
                  label={activeWorkspace.name}
                  deleteIcon={<ArrowDropDownIcon />}
                  onDelete={(e) => setWsMenuAnchor(e.currentTarget as HTMLElement)}
                  onClick={(e) => setWsMenuAnchor(e.currentTarget)}
                  size="small"
                  variant="outlined"
                  sx={{
                    color: TEXT_MUTED,
                    borderColor: "rgba(255,255,255,0.2)",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    "& .MuiChip-icon": { color: TEXT_MUTED },
                    "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.4)" },
                    "&:hover": { borderColor: "rgba(255,255,255,0.45)", color: "white" },
                  }}
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
          </Stack>

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
                <Button component={RouterLink} to={wPath("/tournaments")} sx={navBtnSx}>
                  Tournaments
                </Button>
                <Button component={RouterLink} to="/me" sx={navBtnSx}>
                  My Profile
                </Button>
                <Button component={RouterLink} to="/whats-new" sx={navBtnSx}>
                  What&apos;s New
                </Button>

                <Button
                  variant="contained"
                  onClick={() => navigate(wPath("/tournaments"), { state: { openCreate: true } })}
                  sx={{
                    ml: 1,
                    bgcolor: ACCENT,
                    "&:hover": { bgcolor: "#b8003f" },
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                >
                  Create Tournament
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
                      <ListItemButton
                        onClick={() => handleNavClick("/register")}
                        sx={{ color: ACCENT, fontWeight: 600 }}
                      >
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
