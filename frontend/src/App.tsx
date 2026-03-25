import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentView from "./pages/TournamentView";
import TournamentMatches from "./pages/TournamentMatches";
import TournamentPairings from "./pages/TournamentPairings";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Welcome from "./pages/Welcome";
import Me from "./pages/Me";
import WorkspaceSettings from "./pages/WorkspaceSettings";
import CreateWorkspace from "./pages/CreateWorkspace";
import AcceptInvite from "./pages/AcceptInvite";
import ClaimPlayer from "./pages/ClaimPlayer";
import TournamentJoin from "./pages/TournamentJoin";
import TournamentJoinDisplay from "./pages/TournamentJoinDisplay";
import PlayerTournamentView from "./pages/PlayerTournamentView";
import DeviceTournaments from "./pages/DeviceTournaments";
import JoinLanding from "./pages/JoinLanding";
import WhatsNew from "./pages/WhatsNew";
import { useAuth } from "./AuthContext";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

function RedirectToWorkspace() {
  const { workspaces, loading } = useWorkspace();
  if (loading) return null;
  if (workspaces.length > 0) {
    return <Navigate to={`/w/${workspaces[0].slug}/tournaments`} replace />;
  }
  return <Navigate to="/workspaces/new" replace />;
}

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

/**
 * App shell for all routes other than "/".
 * Landing has its own full-screen layout with a bespoke nav;
 * everything else gets the shared Header + scrollable Container.
 */
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <Header />
      <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <Container
          component="main"
          sx={{
            py: { xs: 1, sm: 2, md: 3 },
            px: { xs: 1, sm: 2 },
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <Routes>
        {/* ── Landing: full-screen, own nav ───────────────────────── */}
        <Route path="/" element={<RootRoute />} />

        {/* ── All other routes: shared Header + Container ─────────── */}
        <Route
          path="/*"
          element={
            <AppLayout>
              <Routes>
                {/* ── Public ──────────────────────────────────── */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* ── Public pairings (no auth required) ──────── */}
                <Route path="/public/t/:publicSlug" element={<TournamentPairings />} />

                {/* ── Invite & claim links ─────────────────────── */}
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route path="/claim/:token" element={<ClaimPlayer />} />
                <Route path="/join" element={<JoinLanding />} />
                <Route path="/join/c/:code" element={<JoinLanding />} />
                <Route path="/join/:tournamentId" element={<TournamentJoin />} />
                <Route path="/t/:tournamentId/me" element={<PlayerTournamentView />} />
                <Route path="/my-tournaments" element={<DeviceTournaments />} />

                {/* ── What's New ───────────────────────────────── */}
                <Route path="/whats-new" element={<WhatsNew />} />

                {/* ── Post-signup onboarding ───────────────────── */}
                <Route
                  path="/welcome"
                  element={
                    <RequireAuth>
                      <Welcome />
                    </RequireAuth>
                  }
                />

                {/* ── Player profile ───────────────────────────── */}
                <Route
                  path="/me"
                  element={
                    <RequireAuth>
                      <Me />
                    </RequireAuth>
                  }
                />

                {/* ── Workspace management ─────────────────────── */}
                <Route
                  path="/workspaces/new"
                  element={
                    <RequireAuth>
                      <CreateWorkspace />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/settings"
                  element={
                    <RequireAuth>
                      <WorkspaceSettings />
                    </RequireAuth>
                  }
                />

                {/* ── Redirect /dashboard → workspace home ─────── */}
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <RedirectToWorkspace />
                    </RequireAuth>
                  }
                />

                {/* ── Workspace-scoped routes ───────────────────── */}
                <Route
                  path="/w/:workspaceSlug/dashboard"
                  element={
                    <RequireAuth>
                      <Dashboard />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments"
                  element={
                    <RequireAuth>
                      <Tournaments />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments/create"
                  element={
                    <RequireAuth>
                      <CreateTournament />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments/:id"
                  element={
                    <RequireAuth>
                      <TournamentView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments/:id/matches"
                  element={
                    <RequireAuth>
                      <TournamentMatches />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments/:id/pairings"
                  element={
                    <RequireAuth>
                      <TournamentPairings />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/w/:workspaceSlug/tournaments/:id/join-display"
                  element={
                    <RequireAuth>
                      <TournamentJoinDisplay />
                    </RequireAuth>
                  }
                />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
    </WorkspaceProvider>
  );
}

export default App;
