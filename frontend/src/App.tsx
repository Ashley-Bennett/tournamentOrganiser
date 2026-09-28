import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "./components/Header";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoading from "./components/PageLoading";
import PlayerNotifications from "./components/PlayerNotifications";
import BadgeWatcher from "./components/BadgeWatcher";
import { useAuth } from "./AuthContext";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { getAllEntries } from "./utils/playerStorage";
import { supabase } from "./supabaseClient";
import { slugify, randomSuffix } from "./utils/slugify";

// Every page is its own chunk, so a player opening a join link does not
// download the organiser stats, the Badge Case and the landing page first.
// The shell above (header, contexts, watchers) stays in the main bundle.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tournaments = lazy(() => import("./pages/Tournaments"));
const CreateTournament = lazy(() => import("./pages/CreateTournament"));
const TournamentView = lazy(() => import("./pages/TournamentView"));
const TournamentMatches = lazy(() => import("./pages/TournamentMatches"));
const TournamentPairings = lazy(() => import("./pages/TournamentPairings"));
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Me = lazy(() => import("./pages/Me"));
const WorkspaceSettings = lazy(() => import("./pages/WorkspaceSettings"));
const CreateWorkspace = lazy(() => import("./pages/CreateWorkspace"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const ClaimPlayer = lazy(() => import("./pages/ClaimPlayer"));
const TournamentJoin = lazy(() => import("./pages/TournamentJoin"));
const TournamentJoinDisplay = lazy(() => import("./pages/TournamentJoinDisplay"));
const PlayerTournamentView = lazy(() => import("./pages/PlayerTournamentView"));
const DeviceTournaments = lazy(() => import("./pages/DeviceTournaments"));
const JoinLanding = lazy(() => import("./pages/JoinLanding"));
const WhatsNew = lazy(() => import("./pages/WhatsNew"));
// Dev server, or a deployed build with VITE_DEV_TOOLS=true (the dev site).
// Production leaves the flag unset, so its build does not even emit the page.
const showCardHarness =
  import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "true";
const CardHarness = showCardHarness
  ? lazy(() => import("./pages/CardHarness"))
  : () => null;
const Badges = lazy(() => import("./pages/Badges"));
const PlayerStats = lazy(() => import("./pages/PlayerStats"));
const OrganiserStats = lazy(() => import("./pages/OrganiserStats"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

// Silently claims any localStorage tournament entries for the logged-in user.
// Runs once per session per user — guards against re-running with sessionStorage.
// This ensures entries are saved to the account regardless of which onboarding
// path the user took (e.g., chose "organiser" and never saw the claim prompt).
function AutoClaimer() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const sessionKey = `auto_claimed_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");

    const entries = getAllEntries();
    if (entries.length === 0) return;

    void (async () => {
      for (const entry of entries) {
        // Entries without a device token are already account-linked.
        if (!entry.deviceToken) continue;
        await supabase.rpc("self_claim_player_entry", {
          p_tournament_player_id: entry.playerId,
          p_device_token: entry.deviceToken,
        });
      }
    })();
  }, [user]);

  return null;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

/**
 * Entry point after login (`/dashboard`). If the user already belongs to a
 * workspace, send them straight into it. If they have none — a brand-new
 * account — silently provision a default personal workspace and drop them in,
 * so users never see a workspace-creation wall. Only if provisioning errors do
 * we fall back to the manual create page.
 */
function RedirectToWorkspace() {
  const { workspaces, loading, refreshWorkspaces } = useWorkspace();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const creatingRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading || workspaces.length > 0 || creatingRef.current) return;
    creatingRef.current = true;

    void (async () => {
      const base =
        profile?.display_name?.trim() ||
        user?.email?.split("@")[0] ||
        "My";
      const wsName = `${base}'s workspace`;
      const slug = slugify(wsName) || `workspace-${randomSuffix()}`;

      // Idempotent: returns the user's existing personal workspace if
      // one already exists, otherwise provisions a single new one.
      // Safe against remounts / double-fires / concurrent tabs, so it
      // can never create a duplicate personal workspace.
      const { data, error } = await supabase.rpc("ensure_personal_workspace", {
        p_name: wsName,
        p_slug: slug,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!error && data) {
        refreshWorkspaces();
        navigate(`/w/${(data as { slug: string }).slug}/dashboard`, {
          replace: true,
        });
        return;
      }
      // Unexpected failure — let the user create one manually
      setFailed(true);
    })();
  }, [loading, workspaces, profile, user, navigate, refreshWorkspaces]);

  if (loading) return null;
  if (workspaces.length > 0) {
    return <Navigate to={`/w/${workspaces[0].slug}/dashboard`} replace />;
  }
  if (failed) {
    return <Navigate to="/workspaces/new" replace />;
  }
  // Provisioning in progress
  return null;
}

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    // Landing has no shell around it, so there is nothing to show while its
    // chunk loads — and on a fast connection a spinner would only flash.
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
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
          <ErrorBoundary section="page">
            {/* Inside the layout, so the header stays put while a page loads. */}
            <Suspense fallback={<PageLoading />}>{children}</Suspense>
          </ErrorBoundary>
        </Container>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <AutoClaimer />
      <PlayerNotifications />
      <BadgeWatcher />
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
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />

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

                {/* ── Card harness ─────────────────────────────────
                    Dev server and dev site only: every card state on one page,
                    including the ones that are awkward to reach with real data.
                    Stripped from a production build by the showCardHarness guard. */}
                {showCardHarness && (
                  <Route path="/dev/cards" element={<CardHarness />} />
                )}

                {/* ── What's New ───────────────────────────────── */}
                <Route path="/whats-new" element={<WhatsNew />} />

                {/* ── Player stats ─────────────────────────────── */}
                <Route
                  path="/stats"
                  element={
                    <RequireAuth>
                      <PlayerStats />
                    </RequireAuth>
                  }
                />

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

                <Route
                  path="/me/badges"
                  element={
                    <RequireAuth>
                      <Badges />
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
                  path="/w/:workspaceSlug/stats"
                  element={
                    <RequireAuth>
                      <OrganiserStats />
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
