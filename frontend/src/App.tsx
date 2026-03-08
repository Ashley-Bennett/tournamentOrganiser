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
import { useAuth } from "./AuthContext";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return children;
}

/** After login, redirect the user to their default workspace. */
function RedirectToWorkspace() {
  const { workspaces, loading } = useWorkspace();
  if (loading) return null;
  if (workspaces.length > 0) {
    return <Navigate to={`/w/${workspaces[0].slug}/tournaments`} replace />;
  }
  return <Navigate to="/workspaces/new" replace />;
}

/** Show Landing to guests; redirect authenticated users to the dashboard. */
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

function App() {
  return (
    <WorkspaceProvider>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        <Header />
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <Container component="main" sx={{ py: { xs: 1, sm: 2, md: 3 }, px: { xs: 1, sm: 2 }, display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <Routes>
            {/* ── Public ───────────────────────────────────────── */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* ── Public pairings page (no auth required) ─────── */}
            <Route path="/public/t/:publicSlug" element={<TournamentPairings />} />

            {/* ── Post-signup intent screen ────────────────────── */}
            <Route
              path="/welcome"
              element={
                <RequireAuth>
                  <Welcome />
                </RequireAuth>
              }
            />

            {/* ── Player profile ───────────────────────────────── */}
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <Me />
                </RequireAuth>
              }
            />

            {/* ── Workspace management ─────────────────────────── */}
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

            {/* ── Invite acceptance ────────────────────────────── */}
            <Route path="/invite/:token" element={<AcceptInvite />} />

            {/* ── Player claim link ─────────────────────────────── */}
            <Route path="/claim/:token" element={<ClaimPlayer />} />

            {/* ── Redirect /dashboard → workspace home ─────────── */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <RedirectToWorkspace />
                </RequireAuth>
              }
            />

            {/* ── Workspace-scoped routes ──────────────────────── */}
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
          </Routes>
        </Container>
        </Box>
      </Box>
    </WorkspaceProvider>
  );
}

export default App;
