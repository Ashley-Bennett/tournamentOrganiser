import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentView from "./pages/TournamentView";
import Players from "./pages/Players";
import Leagues from "./pages/Leagues";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { useAuth } from "./AuthContext";

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

function App() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <Container component="main" sx={{ flexGrow: 1, py: 3 }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/tournaments"
            element={
              <RequireAuth>
                <Tournaments />
              </RequireAuth>
            }
          />
          <Route
            path="/tournaments/create"
            element={
              <RequireAuth>
                <CreateTournament />
              </RequireAuth>
            }
          />
          <Route
            path="/tournaments/:id"
            element={
              <RequireAuth>
                <TournamentView />
              </RequireAuth>
            }
          />
          <Route
            path="/players"
            element={
              <RequireAuth>
                <Players />
              </RequireAuth>
            }
          />
          <Route
            path="/leagues"
            element={
              <RequireAuth>
                <Leagues />
              </RequireAuth>
            }
          />
        </Routes>
      </Container>
    </Box>
  );
}

export default App;
