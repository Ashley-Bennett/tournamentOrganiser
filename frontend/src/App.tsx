import { Routes, Route } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentView from "./pages/TournamentView";
import Players from "./pages/Players";
import Leagues from "./pages/Leagues";

function App() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />
      <Container component="main" sx={{ flexGrow: 1, py: 3 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/create" element={<CreateTournament />} />
          <Route path="/tournaments/:id" element={<TournamentView />} />
          <Route path="/players" element={<Players />} />
          <Route path="/leagues" element={<Leagues />} />
        </Routes>
      </Container>
    </Box>
  );
}

export default App;
