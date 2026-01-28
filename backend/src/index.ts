import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { PostgresDatabase } from "./database/postgres-database";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || "https://matchamp.win",
    "https://matchamp.win",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://localhost:5173",
    "https://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
const db = new PostgresDatabase();

// JWT authentication middleware
function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  console.log("🔐 JWT Authentication check for:", req.path);
  console.log("🔐 Headers:", req.headers);

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Missing or invalid Authorization header");
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "devsecret");
    console.log("✅ JWT verified successfully for user:", decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.log("❌ JWT verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Matchamp Backend is running",
  });
});

// API routes
app.get("/api", (req, res) => {
  res.json({
    message: "Matchamp API",
    version: "1.0.0",
  });
});

// User routes
app.post("/api/users", async (req, res) => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    requestBody: {
      name: req.body.name,
      email: req.body.email,
      hasPassword: !!req.body.password,
    },
    databaseUrl: process.env.DATABASE_URL || "no database url",
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    console.log("📝 Registration attempt:", {
      name: req.body.name,
      email: req.body.email,
    });

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        error: "Name, email, and password are required",
        debug: debugInfo,
      });
    }

    console.log("🔐 Creating user in database...");
    const result = await db.createUser({ name, email, password });
    console.log("✅ User created successfully with ID:", result.id);

    const response = {
      id: result.id,
      message: "User created successfully",
      debug: { ...debugInfo, ...result.debug },
    };
    console.log("📤 Sending response:", response);
    res.status(201).json(response);
  } catch (error: any) {
    console.error("❌ Error creating user:", error);

    // Handle the new error structure from database
    const errorDetails =
      error.details ||
      error.message ||
      (error.error && error.error.message) ||
      "Unknown error";
    const errorDebug = error.debug || debugInfo;

    if (errorDetails.includes("UNIQUE constraint failed")) {
      res.status(409).json({
        error: "Email already exists",
        debug: errorDebug,
      });
    } else {
      res.status(500).json({
        error: "Failed to create user",
        details: errorDetails,
        debug: errorDebug,
      });
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

// Login endpoint
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    // Issue JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || "devsecret",
      { expiresIn: "12h" }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Protect all API routes except login and user registration
app.use("/api", (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === "OPTIONS") {
    return next();
  }
  // Skip authentication for login and user registration
  if (req.path === "/login" || req.path === "/users") {
    return next();
  }
  return authenticateJWT(req, res, next);
});

// League routes
app.post("/api/leagues", async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = (req.user as any).id;

    if (!name) {
      return res.status(400).json({ error: "League name is required" });
    }

    const leagueId = await db.createLeague({
      name,
      description,
      owner_id: userId,
    });
    res
      .status(201)
      .json({ id: leagueId, message: "League created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create league" });
  }
});

app.get("/api/leagues", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const leagues = await db.getAccessibleLeagues(userId);
    res.json(leagues);
  } catch (error) {
    res.status(500).json({ error: "Failed to get leagues" });
  }
});

// League delete
app.delete("/api/leagues/:id", async (req, res) => {
  try {
    const leagueId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const access = await db.getLeagueAccess(userId, leagueId);
    if (access !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await db.runRawQuery("DELETE FROM leagues WHERE id = $1", [leagueId]);
    res.json({ message: "League deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete league" });
  }
});

// Tournament routes
app.post("/api/tournaments", async (req, res) => {
  try {
    const { name, date, league_id, bracket_type, status } = req.body;
    const userId = (req.user as any).id;
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
      owner_id: userId,
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
    const userId = (req.user as any).id;
    const tournaments = await db.getAccessibleTournaments(userId);
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

// Tournament update (completion)
app.patch("/api/tournaments/:id/completion", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const access = await db.getTournamentAccess(userId, tournamentId);
    if (access !== "owner" && access !== "editor") {
      return res.status(403).json({ error: "Forbidden" });
    }
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
// Tournament delete
app.delete("/api/tournaments/:id", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const access = await db.getTournamentAccess(userId, tournamentId);
    if (access !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await db.runRawQuery("DELETE FROM matches WHERE tournament_id = $1", [
      tournamentId,
    ]);
    await db.runRawQuery(
      "DELETE FROM tournament_players WHERE tournament_id = $1",
      [tournamentId]
    );
    await db.runRawQuery("DELETE FROM tournaments WHERE id = $1", [
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
    const { name, static_seating, trainer_id, birth_year } = req.body;
    const userId = (req.user as any).id;

    if (!name) {
      return res.status(400).json({ error: "Player name is required" });
    }

    const playerId = await db.createPlayer({
      name,
      static_seating,
      trainer_id,
      birth_year,
      owner_id: userId,
    });
    res
      .status(201)
      .json({ id: playerId, message: "Player created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create player" });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    console.log("🔍 API: Getting players for user ID:", userId);
    const players = await db.getAccessiblePlayers(userId);
    console.log("🔍 API: Players to be sent to frontend:", players);
    res.json(players);
  } catch (error) {
    console.error("🔍 API: Error getting players:", error);
    res.status(500).json({ error: "Failed to get players" });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const access = await db.getPlayerAccess(userId, playerId);
    if (access !== "owner" && access !== "editor") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, static_seating, trainer_id, birth_year } = req.body;
    await db.updatePlayer({
      id: playerId,
      name,
      static_seating,
      trainer_id,
      birth_year,
    });
    res.json({ message: "Player updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update player" });
  }
});

// Player delete
app.delete("/api/players/:id", async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    const access = await db.getPlayerAccess(userId, playerId);
    if (access !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await db.runRawQuery("DELETE FROM players WHERE id = $1", [playerId]);
    res.json({ message: "Player deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete player" });
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

    // If dropping, determine round logic
    if (dropped) {
      // Get all matches for the tournament
      const matches = await db.getMatchesByTournament(tournamentId);
      if (!matches.length) {
        // No matches, just drop for round 1
        await db.updatePlayerDropStatus(tournamentId, playerId, true);
        await db.updatePlayerStartedRound(tournamentId, playerId, 1);
        return res.json({ message: "Player drop status updated (no matches)" });
      }
      // Find the current round (max round_number)
      const currentRound = Math.max(...matches.map((m) => m.round_number));
      // Find the player's match for the current round
      const playerMatch = matches.find(
        (m) =>
          m.round_number === currentRound &&
          (m.player1_id === playerId || m.player2_id === playerId)
      );
      let dropRound = currentRound + 1;
      if (playerMatch) {
        if (!playerMatch.result) {
          // Unresolved match: award win to opponent
          let winnerId = null;
          let result = null;
          if (playerMatch.player1_id === playerId && playerMatch.player2_id) {
            winnerId = playerMatch.player2_id;
            result = "WIN_P2";
          } else if (
            playerMatch.player2_id === playerId &&
            playerMatch.player1_id
          ) {
            winnerId = playerMatch.player1_id;
            result = "WIN_P1";
          }
          if (result && winnerId) {
            await db.updateMatchResult(playerMatch.id, result, winnerId, true);
          }
          dropRound = currentRound; // Drop for current round
        }
      }
      // Set dropped and started_round
      await db.updatePlayerDropStatus(tournamentId, playerId, true);
      await db.updatePlayerStartedRound(tournamentId, playerId, dropRound);
      return res.json({ message: `Player dropped for round ${dropRound}` });
    } else {
      // If reinstating, just set dropped to false (do not change started_round)
      await db.updatePlayerDropStatus(tournamentId, playerId, false);
      return res.json({ message: "Player reinstated" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to update player drop status" });
  }
});

app.patch(
  "/api/tournaments/:id/players/:playerId/started_round",
  async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      const playerId = parseInt(req.params.playerId);
      const { started_round } = req.body;
      if (typeof started_round !== "number" || started_round < 1) {
        return res
          .status(400)
          .json({ error: "started_round must be a positive integer" });
      }
      await db.updatePlayerStartedRound(tournamentId, playerId, started_round);
      res.json({ message: "Player started_round updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update player started_round" });
    }
  }
);

app.delete("/api/tournaments/:id/players/:playerId", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    await db.runRawQuery(
      "DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?",
      [tournamentId, playerId]
    );
    res.json({ message: "Player removed from tournament successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove player from tournament" });
  }
});

app.delete("/api/tournaments/:id/players", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    await db.runRawQuery(
      "DELETE FROM tournament_players WHERE tournament_id = ?",
      [tournamentId]
    );
    res.json({ message: "All players removed from tournament successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to remove all players from tournament" });
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

    // Update tournament status to 'active' if it was 'new'
    await db.updateTournamentStatusToActive(tournamentId);

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

    // Update tournament status to 'active' if it was 'new'
    await db.updateTournamentStatusToActive(tournamentId);

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

// Start a round (unlock result options)
app.post("/api/tournaments/:id/rounds/:roundNumber/start", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const roundNumber = parseInt(req.params.roundNumber);

    await db.updateRoundStatus(tournamentId, roundNumber, "started");

    // Automatically set bye results for matches with null player2_id
    const byeMatches = await db.runRawQuery(
      `SELECT id, player1_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player2_id IS NULL AND result IS NULL`,
      [tournamentId, roundNumber]
    );

    for (const match of byeMatches) {
      await db.updateMatchResult(match.id, "BYE", match.player1_id, true);
    }

    res.json({ message: "Round started successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to start round" });
  }
});

// Complete a round (lock result options)
app.post(
  "/api/tournaments/:id/rounds/:roundNumber/complete",
  async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      const roundNumber = parseInt(req.params.roundNumber);

      await db.updateRoundStatus(tournamentId, roundNumber, "completed");
      res.json({ message: "Round completed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete round" });
    }
  }
);

// Get round status
app.get("/api/tournaments/:id/rounds/:roundNumber/status", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const roundNumber = parseInt(req.params.roundNumber);

    const status = await db.getRoundStatus(tournamentId, roundNumber);
    res.json({ status });
  } catch (error) {
    res.status(500).json({ error: "Failed to get round status" });
  }
});

// Delete a match
app.delete("/api/matches/:id", async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    await db.deleteMatch(matchId);
    res.json({ message: "Match deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete match" });
  }
});

// Update a match (edit pairing)
app.patch("/api/matches/:id", async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    const { player1_id, player2_id } = req.body;

    // Get the match to find tournament and round
    const dbMatch = await db.getRawQuery(
      "SELECT tournament_id, round_number FROM matches WHERE id = $1",
      [matchId]
    );
    if (!dbMatch) {
      return res.status(404).json({ error: "Match not found" });
    }
    const { tournament_id, round_number } = dbMatch;

    // Get all matches for this tournament and round
    const matches = await db.getRawQuery(
      `SELECT * FROM matches WHERE tournament_id = $1 AND round_number = $2 AND id != $3`,
      [tournament_id, round_number, matchId]
    );

    // Helper to check if a player is already paired in this round
    function isPlayerPaired(playerId: number | null | undefined): boolean {
      if (!playerId) return false;
      return (
        Array.isArray(matches) &&
        matches.some(
          (m: any) => m.player1_id === playerId || m.player2_id === playerId
        )
      );
    }

    if (isPlayerPaired(player1_id)) {
      return res
        .status(400)
        .json({ error: "Player 1 is already paired in this round" });
    }
    if (isPlayerPaired(player2_id)) {
      return res
        .status(400)
        .json({ error: "Player 2 is already paired in this round" });
    }

    await db.updateMatch(matchId, player1_id, player2_id);
    res.json({ message: "Match updated successfully" });
  } catch (error) {
    console.error("Error updating match:", error);
    res.status(500).json({ error: "Failed to update match" });
  }
});

// Get unpaired players for a round
app.get(
  "/api/tournaments/:id/rounds/:roundNumber/unpaired-players",
  async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      const roundNumber = parseInt(req.params.roundNumber);
      const players = await db.getUnpairedPlayersForRound(
        tournamentId,
        roundNumber
      );
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to get unpaired players" });
    }
  }
);

// --- Collaborator Management Endpoints ---
// Tournament collaborators
app.post("/api/tournaments/:id/collaborators", async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const tournamentId = parseInt(req.params.id);
    if (!user_id || !role)
      return res.status(400).json({ error: "user_id and role required" });
    await db.addTournamentCollaborator(tournamentId, user_id, role);
    res.json({ message: "Collaborator added" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add collaborator" });
  }
});
app.delete("/api/tournaments/:id/collaborators/:userId", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    await db.removeTournamentCollaborator(tournamentId, userId);
    res.json({ message: "Collaborator removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove collaborator" });
  }
});
app.get("/api/tournaments/:id/collaborators", async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const collaborators = await db.getTournamentCollaborators(tournamentId);
    res.json(collaborators);
  } catch (error) {
    res.status(500).json({ error: "Failed to get collaborators" });
  }
});

// League collaborators
app.post("/api/leagues/:id/collaborators", async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const leagueId = parseInt(req.params.id);
    if (!user_id || !role)
      return res.status(400).json({ error: "user_id and role required" });
    await db.addLeagueCollaborator(leagueId, user_id, role);
    res.json({ message: "Collaborator added" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add collaborator" });
  }
});
app.delete("/api/leagues/:id/collaborators/:userId", async (req, res) => {
  try {
    const leagueId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    await db.removeLeagueCollaborator(leagueId, userId);
    res.json({ message: "Collaborator removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove collaborator" });
  }
});
app.get("/api/leagues/:id/collaborators", async (req, res) => {
  try {
    const leagueId = parseInt(req.params.id);
    const collaborators = await db.getLeagueCollaborators(leagueId);
    res.json(collaborators);
  } catch (error) {
    res.status(500).json({ error: "Failed to get collaborators" });
  }
});

// Player collaborators
app.post("/api/players/:id/collaborators", async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const playerId = parseInt(req.params.id);
    if (!user_id || !role)
      return res.status(400).json({ error: "user_id and role required" });
    await db.addPlayerCollaborator(playerId, user_id, role);
    res.json({ message: "Collaborator added" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add collaborator" });
  }
});
app.delete("/api/players/:id/collaborators/:userId", async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    await db.removePlayerCollaborator(playerId, userId);
    res.json({ message: "Collaborator removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove collaborator" });
  }
});
app.get("/api/players/:id/collaborators", async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    const collaborators = await db.getPlayerCollaborators(playerId);
    res.json(collaborators);
  } catch (error) {
    res.status(500).json({ error: "Failed to get collaborators" });
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

// Serve static files from the React app build directory in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../frontend/dist")));

  // For any request that doesn't match an API route, serve the React app
  app.get("*", (req, res) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Route not found" });
    }

    // Serve the React app's index.html for all other routes
    res.sendFile(path.join(__dirname, "../../frontend/dist/index.html"));
  });
} else {
  // In development, redirect non-API routes to the frontend dev server
  app.use("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      return res.redirect(`http://localhost:5173${req.path}`);
    }
    res.status(404).json({ error: "Route not found" });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
