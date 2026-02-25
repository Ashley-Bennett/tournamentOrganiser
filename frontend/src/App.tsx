import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentView from "./pages/TournamentView";
import TournamentMatches from "./pages/TournamentMatches";
import TournamentLeaderboard from "./pages/TournamentLeaderboard";
import TournamentPairings from "./pages/TournamentPairings";
import Players from "./pages/Players";
import Leagues from "./pages/Leagues";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Welcome from "./pages/Welcome";
import Me from "./pages/Me";
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
  return <Navigate to="/" replace />;
}

function App() {
  return (
    <WorkspaceProvider>
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Header />
        <Container component="main" sx={{ flexGrow: 1, py: 3 }}>
          <Routes>
            {/* ── Public ───────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

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
            <Route
              path="/w/:workspaceSlug/tournaments/:id/leaderboard"
              element={
                <RequireAuth>
                  <TournamentLeaderboard />
                </RequireAuth>
              }
            />
            <Route
              path="/w/:workspaceSlug/players"
              element={
                <RequireAuth>
                  <Players />
                </RequireAuth>
              }
            />
            <Route
              path="/w/:workspaceSlug/leagues"
              element={
                <RequireAuth>
                  <Leagues />
                </RequireAuth>
              }
            />
          </Routes>
        </Container>
      </Box>
    </WorkspaceProvider>
  );
}

export default App;
