import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { Database } from "./database/database";
import seedData from "./seedData";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
const db = new Database();

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Tournament Organiser Backend is running",
  });
});

// Seed data endpoint (for development only)
if (process.env.NODE_ENV === "development") {
  app.post("/api/seed", async (req, res) => {
    try {
      await seedData();
      res.json({ message: "Database seeded successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to seed database" });
    }
  });
}

// API routes
app.get("/api", (req, res) => {
  res.json({
    message: "Tournament Organiser API",
    version: "1.0.0",
  });
});

// User routes
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    const userId = await db.createUser({ name, email, password });
    res.status(201).json({ id: userId, message: "User created successfully" });
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Email already exists" });
    } else {
      res.status(500).json({ error: "Failed to create user" });
    }
  }
});

app.get("/api/users/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const user = await db.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

// League routes
app.post("/api/leagues", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "League name is required" });
    }

    const leagueId = await db.createLeague({ name, description });
    res
      .status(201)
      .json({ id: leagueId, message: "League created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create league" });
  }
});

app.get("/api/leagues", async (req, res) => {
  try {
    const leagues = await db.getLeagues();
    res.json(leagues);
  } catch (error) {
    res.status(500).json({ error: "Failed to get leagues" });
  }
});

// Tournament routes
app.post("/api/tournaments", async (req, res) => {
  try {
    const { name, date, league_id, bracket_type, status } = req.body;
    console.log("Creating tournament with data:", {
      name,
      date,
      league_id,
      bracket_type,
      status,
    });

    if (!name || !date) {
      return res
        .status(400)
        .json({ error: "Tournament name and date are required" });
    }

    if (
      !bracket_type ||
      !["SWISS", "SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(
        bracket_type
      )
    ) {
      return res.status(400).json({
        error:
          "Valid bracket type is required (SWISS, SINGLE_ELIMINATION, DOUBLE_ELIMINATION)",
      });
    }

    // For now, only allow SWISS tournaments
    if (bracket_type !== "SWISS") {
      return res
        .status(400)
        .json({ error: "Only SWISS tournaments are currently supported" });
    }

    const tournamentId = await db.createTournament({
      name,
      date,
      league_id,
      bracket_type,
      status: status || "new",
    });
    res
      .status(201)
      .json({ id: tournamentId, message: "Tournament created successfully" });
  } catch (error) {
    console.error("Error creating tournament:", error);
    res.status(500).json({ error: "Failed to create tournament" });
  }
});

app.get("/api/tournaments", async (req, res) => {
  try {
    const tournaments = await db.getTournaments();
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: "Failed to get tournaments" });
  }
});

app.get("/api/tournaments/:id", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const tournament = await db.getTournamentById(tournamentId);

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json(tournament);
  } catch (error) {
    res.status(500).json({ error: "Failed to get tournament" });
  }
});

app.patch("/api/tournaments/:id/completion", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { is_completed } = req.body;

    if (typeof is_completed !== "boolean") {
      return res.status(400).json({ error: "is_completed must be a boolean" });
    }

    await db.updateTournamentCompletion(tournamentId, is_completed);
    res.json({ message: "Tournament completion status updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update tournament completion" });
  }
});

app.delete("/api/tournaments/:id", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    // Delete matches
    await db.runRawQuery("DELETE FROM matches WHERE tournament_id = ?", [
      tournamentId,
    ]);
    // Delete tournament_players
    await db.runRawQuery(
      "DELETE FROM tournament_players WHERE tournament_id = ?",
      [tournamentId]
    );
    // Delete tournament
    await db.runRawQuery("DELETE FROM tournaments WHERE id = ?", [
      tournamentId,
    ]);
    res.json({ message: "Tournament deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete tournament" });
  }
});

// Player routes
app.post("/api/players", async (req, res) => {
  try {
    const { name, static_seating } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Player name is required" });
    }

    const playerId = await db.createPlayer({ name, static_seating });
    res
      .status(201)
      .json({ id: playerId, message: "Player created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create player" });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const players = await db.getPlayers();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: "Failed to get players" });
  }
});

// TournamentPlayer routes
app.post("/api/tournaments/:id/players", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { player_id, started_round } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: "Player ID is required" });
    }

    await db.addPlayerToTournament({
      player_id,
      tournament_id: tournamentId,
      started_round,
    });
    res
      .status(201)
      .json({ message: "Player added to tournament successfully" });
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Player is already in this tournament" });
    } else {
      res.status(500).json({ error: "Failed to add player to tournament" });
    }
  }
});

app.post("/api/tournaments/:id/players/bulk", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { players, started_round } = req.body;

    if (!players || !Array.isArray(players) || players.length === 0) {
      return res
        .status(400)
        .json({ error: "Players array is required and must not be empty" });
    }

    const playersToAdd = players.map((playerId: number) => ({
      player_id: playerId,
      tournament_id: tournamentId,
      started_round,
    }));

    await db.addMultiplePlayersToTournament(playersToAdd);
    res.status(201).json({
      message: `${players.length} player(s) added to tournament successfully`,
    });
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      res
        .status(409)
        .json({ error: "One or more players are already in this tournament" });
    } else {
      res.status(500).json({ error: "Failed to add players to tournament" });
    }
  }
});

app.get("/api/tournaments/:id/players", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const players = await db.getTournamentPlayers(tournamentId);
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: "Failed to get tournament players" });
  }
});

app.patch("/api/tournaments/:id/players/:playerId/drop", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    const { dropped } = req.body;

    if (typeof dropped !== "boolean") {
      return res.status(400).json({ error: "dropped must be a boolean" });
    }

    await db.updatePlayerDropStatus(tournamentId, playerId, dropped);
    res.json({ message: "Player drop status updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update player drop status" });
  }
});

// Match routes
app.post("/api/tournaments/:id/matches", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { round_number, player1_id, player2_id, result } = req.body;

    if (!round_number) {
      return res.status(400).json({ error: "Round number is required" });
    }

    const matchId = await db.createMatch({
      tournament_id: tournamentId,
      round_number,
      player1_id,
      player2_id,
      result,
    });

    res
      .status(201)
      .json({ id: matchId, message: "Match created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create match" });
  }
});

app.get("/api/tournaments/:id/matches", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const matches = await db.getMatchesByTournament(tournamentId);
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: "Failed to get tournament matches" });
  }
});

app.patch("/api/matches/:id/result", async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    const { result, winner_id, modified_by_to } = req.body;

    if (!result || !["WIN_P1", "WIN_P2", "DRAW", "BYE"].includes(result)) {
      return res.status(400).json({
        error: "Valid result is required (WIN_P1, WIN_P2, DRAW, BYE)",
      });
    }

    await db.updateMatchResult(matchId, result, winner_id, modified_by_to);
    res.json({ message: "Match result updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update match result" });
  }
});

// Get player standings for a tournament
app.get("/api/tournaments/:id/standings", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const standings = await db.getPlayerStandings(tournamentId);
    res.json(standings);
  } catch (error) {
    res.status(500).json({ error: "Failed to get player standings" });
  }
});

// Get leaderboard with tiebreakers for a tournament
app.get("/api/tournaments/:id/leaderboard", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const leaderboard = await db.getLeaderboardWithTiebreakers(tournamentId);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Create automatic pairings for a round
app.post("/api/tournaments/:id/pairings", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { round_number } = req.body;

    if (!round_number) {
      return res.status(400).json({ error: "Round number is required" });
    }

    const pairings = await db.createAutomaticPairings(
      tournamentId,
      round_number
    );
    res.status(201).json({
      message: "Automatic pairings created successfully",
      pairings,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to create automatic pairings" });
  }
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error: "Something went wrong!",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Internal server error",
    });
  }
);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
