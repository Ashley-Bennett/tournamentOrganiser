import { Pool, PoolClient } from "pg";
import bcrypt from "bcrypt";

const DEBUG = process.env.DEBUG === "true";

export class PostgresDatabase {
  private pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });

    console.log("✅ Connected to PostgreSQL database");
    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    console.log("🔧 Initializing PostgreSQL tables...");

    const client = await this.pool.connect();
    try {
      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create leagues table
      await client.query(`
        CREATE TABLE IF NOT EXISTS leagues (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          owner_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create tournaments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tournaments (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          league_id INTEGER REFERENCES leagues(id),
          owner_id INTEGER NOT NULL REFERENCES users(id),
          bracket_type TEXT NOT NULL DEFAULT 'SWISS' CHECK(bracket_type IN ('SWISS', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION')),
          is_completed BOOLEAN DEFAULT FALSE,
          status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'active', 'completed')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create players table
      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          static_seating BOOLEAN DEFAULT FALSE,
          trainer_id TEXT,
          birth_year INTEGER,
          owner_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create tournament_players table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tournament_players (
          player_id INTEGER REFERENCES players(id),
          tournament_id INTEGER REFERENCES tournaments(id),
          dropped BOOLEAN DEFAULT FALSE,
          started_round INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (player_id, tournament_id)
        )
      `);

      // Create matches table
      await client.query(`
        CREATE TABLE IF NOT EXISTS matches (
          id SERIAL PRIMARY KEY,
          tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
          round_number INTEGER NOT NULL,
          player1_id INTEGER REFERENCES players(id),
          player2_id INTEGER REFERENCES players(id),
          winner_id INTEGER REFERENCES players(id),
          result TEXT CHECK(result IN ('WIN_P1', 'WIN_P2', 'DRAW', 'BYE')),
          modified_by_to BOOLEAN DEFAULT FALSE,
          round_status TEXT DEFAULT 'pending' CHECK(round_status IN ('pending', 'started', 'completed')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log("✅ All PostgreSQL tables created/verified");
    } catch (error) {
      console.error("❌ Error creating tables:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // User methods
  async createUser(user: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ id: number; debug: any }> {
    const debugInfo = {
      databaseType: "postgresql",
      hashedPasswordLength: 0,
      sqlExecuted: false,
    };

    try {
      console.log("🔐 Creating user in PostgreSQL:", {
        name: user.name,
        email: user.email,
      });

      const hashedPassword = await bcrypt.hash(user.password, 10);
      debugInfo.hashedPasswordLength = hashedPassword.length;
      console.log("🔒 Password hashed successfully");

      const sql = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      console.log("📝 Executing SQL:", sql);

      const client = await this.pool.connect();
      try {
        const result = await client.query(sql, [
          user.name,
          user.email,
          hashedPassword,
        ]);
        const userId = result.rows[0].id;
        console.log("✅ User inserted with ID:", userId);
        debugInfo.sqlExecuted = true;
        return { id: userId, debug: debugInfo };
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("❌ Error in createUser:", err);
      debugInfo.sqlExecuted = false;
      throw { error: err, debug: debugInfo };
    }
  }

  async getUserByEmail(email: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getUsers(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM users ORDER BY created_at DESC"
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // League methods
  async createLeague(league: {
    name: string;
    description?: string;
    owner_id: number;
  }): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "INSERT INTO leagues (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id",
        [league.name, league.description || null, league.owner_id]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getLeagues(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM leagues ORDER BY created_at DESC"
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getLeaguesByOwner(ownerId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM leagues WHERE owner_id = $1 ORDER BY created_at DESC",
        [ownerId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Tournament methods
  async createTournament(tournament: {
    name: string;
    date: string;
    league_id?: number;
    bracket_type?: string;
    status?: string;
    owner_id: number;
  }): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO tournaments (name, date, league_id, bracket_type, status, owner_id) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          tournament.name,
          tournament.date,
          tournament.league_id || null,
          tournament.bracket_type || "SWISS",
          tournament.status || "new",
          tournament.owner_id,
        ]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getTournaments(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT t.*, l.name as league_name, u.name as owner_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        LEFT JOIN users u ON t.owner_id = u.id 
        ORDER BY t.created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTournamentsByOwner(ownerId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT t.*, l.name as league_name, u.name as owner_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        LEFT JOIN users u ON t.owner_id = u.id 
        WHERE t.owner_id = $1 
        ORDER BY t.created_at DESC
      `,
        [ownerId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTournamentById(id: number): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT t.*, l.name as league_name, u.name as owner_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        LEFT JOIN users u ON t.owner_id = u.id 
        WHERE t.id = $1
      `,
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // Player methods
  async createPlayer(player: {
    name: string;
    static_seating?: boolean;
    trainer_id?: string;
    birth_year?: number;
    owner_id: number;
  }): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO players (name, static_seating, trainer_id, birth_year, owner_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          player.name,
          player.static_seating || false,
          player.trainer_id || null,
          player.birth_year || null,
          player.owner_id,
        ]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getPlayers(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT p.*, u.name as owner_name 
        FROM players p 
        LEFT JOIN users u ON p.owner_id = u.id 
        ORDER BY p.created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getPlayersByOwner(ownerId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT p.*, u.name as owner_name 
        FROM players p 
        LEFT JOIN users u ON p.owner_id = u.id 
        WHERE p.owner_id = $1 
        ORDER BY p.created_at DESC
      `,
        [ownerId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Match methods
  async createMatch(match: {
    tournament_id: number;
    round_number: number;
    player1_id?: number;
    player2_id?: number;
    result?: string;
  }): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Prevent self-pairing at database level
      if (
        match.player1_id &&
        match.player2_id &&
        match.player1_id === match.player2_id
      ) {
        throw new Error(
          `Self-pairing detected: Player ${match.player1_id} cannot be paired against themselves`
        );
      }

      const result = await client.query(
        `INSERT INTO matches (tournament_id, round_number, player1_id, player2_id, result) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          match.tournament_id,
          match.round_number,
          match.player1_id || null,
          match.player2_id || null,
          match.result || null,
        ]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getMatchesByTournament(tournamentId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT m.*, 
               p1.name as player1_name, 
               p2.name as player2_name,
               w.name as winner_name
        FROM matches m 
        LEFT JOIN players p1 ON m.player1_id = p1.id 
        LEFT JOIN players p2 ON m.player2_id = p2.id 
        LEFT JOIN players w ON m.winner_id = w.id 
        WHERE m.tournament_id = $1 
        ORDER BY m.round_number, m.id
      `,
        [tournamentId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Close the database connection
  async close(): Promise<void> {
    await this.pool.end();
  }

  // Additional methods needed for compatibility
  async updateTournamentCompletion(
    id: number,
    isCompleted: boolean
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE tournaments SET is_completed = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [isCompleted, id]
      );
    } finally {
      client.release();
    }
  }

  async getAccessibleLeagues(userId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT l.*, u.name as owner_name 
        FROM leagues l 
        LEFT JOIN users u ON l.owner_id = u.id 
        WHERE l.owner_id = $1 
        ORDER BY l.created_at DESC
      `,
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getAccessibleTournaments(userId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT t.*, l.name as league_name, u.name as owner_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        LEFT JOIN users u ON t.owner_id = u.id 
        WHERE t.owner_id = $1 
        ORDER BY t.created_at DESC
      `,
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getLeagueAccess(
    userId: number,
    leagueId: number
  ): Promise<"owner" | "editor" | "viewer" | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT owner_id FROM leagues WHERE id = $1",
        [leagueId]
      );
      if (result.rows.length === 0) return null;
      return result.rows[0].owner_id === userId ? "owner" : null;
    } finally {
      client.release();
    }
  }

  async getTournamentAccess(
    userId: number,
    tournamentId: number
  ): Promise<"owner" | "editor" | "viewer" | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT owner_id FROM tournaments WHERE id = $1",
        [tournamentId]
      );
      if (result.rows.length === 0) return null;
      return result.rows[0].owner_id === userId ? "owner" : null;
    } finally {
      client.release();
    }
  }

  async runRawQuery(sql: string, params: any[] = []): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getRawQuery(sql: string, params: any[] = []): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  // Additional missing methods
  async getAccessiblePlayers(userId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT p.*, u.name as owner_name 
        FROM players p 
        LEFT JOIN users u ON p.owner_id = u.id 
        WHERE p.owner_id = $1 
        ORDER BY p.created_at DESC
      `,
        [userId]
      );
      console.log("🔍 Database query result:", result.rows);
      console.log("🔍 Number of players found:", result.rows.length);
      if (result.rows.length > 0) {
        console.log("🔍 First player from database:", result.rows[0]);
        console.log("🔍 First player name from database:", result.rows[0].name);
      }
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getPlayerAccess(
    userId: number,
    playerId: number
  ): Promise<"owner" | "editor" | "viewer" | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT owner_id FROM players WHERE id = $1",
        [playerId]
      );
      if (result.rows.length === 0) return null;
      return result.rows[0].owner_id === userId ? "owner" : null;
    } finally {
      client.release();
    }
  }

  async updatePlayer(player: {
    id: number;
    name?: string;
    static_seating?: boolean;
    trainer_id?: string;
    birth_year?: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (player.name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(player.name);
      }
      if (player.static_seating !== undefined) {
        updates.push(`static_seating = $${paramCount++}`);
        values.push(player.static_seating);
      }
      if (player.trainer_id !== undefined) {
        updates.push(`trainer_id = $${paramCount++}`);
        values.push(player.trainer_id);
      }
      if (player.birth_year !== undefined) {
        updates.push(`birth_year = $${paramCount++}`);
        values.push(player.birth_year);
      }

      if (updates.length === 0) return;

      values.push(player.id);
      await client.query(
        `UPDATE players SET ${updates.join(
          ", "
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount}`,
        values
      );
    } finally {
      client.release();
    }
  }

  async addPlayerToTournament(tournamentPlayer: {
    player_id: number;
    tournament_id: number;
    started_round?: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "INSERT INTO tournament_players (player_id, tournament_id, started_round) VALUES ($1, $2, $3)",
        [
          tournamentPlayer.player_id,
          tournamentPlayer.tournament_id,
          tournamentPlayer.started_round || 1,
        ]
      );
    } finally {
      client.release();
    }
  }

  async addMultiplePlayersToTournament(
    players: {
      player_id: number;
      tournament_id: number;
      started_round?: number;
    }[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      for (const player of players) {
        await client.query(
          "INSERT INTO tournament_players (player_id, tournament_id, started_round) VALUES ($1, $2, $3)",
          [player.player_id, player.tournament_id, player.started_round || 1]
        );
      }
    } finally {
      client.release();
    }
  }

  async getTournamentPlayers(tournamentId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT tp.*, p.name as player_name, p.static_seating, p.trainer_id, p.birth_year
        FROM tournament_players tp
        LEFT JOIN players p ON tp.player_id = p.id
        WHERE tp.tournament_id = $1
        ORDER BY p.name
      `,
        [tournamentId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async updatePlayerDropStatus(
    tournamentId: number,
    playerId: number,
    dropped: boolean
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE tournament_players SET dropped = $1, updated_at = CURRENT_TIMESTAMP WHERE tournament_id = $2 AND player_id = $3",
        [dropped, tournamentId, playerId]
      );
    } finally {
      client.release();
    }
  }

  async updatePlayerStartedRound(
    tournamentId: number,
    playerId: number,
    started_round: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE tournament_players SET started_round = $1, updated_at = CURRENT_TIMESTAMP WHERE tournament_id = $2 AND player_id = $3",
        [started_round, tournamentId, playerId]
      );
    } finally {
      client.release();
    }
  }

  async updateMatchResult(
    matchId: number,
    result: string,
    winnerId?: number,
    modifiedByTo: boolean = true
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE matches SET result = $1, winner_id = $2, modified_by_to = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4",
        [result, winnerId, modifiedByTo, matchId]
      );
    } finally {
      client.release();
    }
  }

  async updateTournamentStatusToActive(tournamentId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE tournaments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        ["active", tournamentId]
      );
    } finally {
      client.release();
    }
  }

  async getPlayerStandings(tournamentId: number): Promise<any[]> {
    // Use the same logic as getLeaderboardWithTiebreakers for consistency
    return this.getLeaderboardWithTiebreakers(tournamentId);
  }

  async getLeaderboardWithTiebreakers(tournamentId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      // First, get basic standings with points
      const basicStandings = await client.query(
        `
        SELECT p.id, p.name, 
               COUNT(CASE WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 1 END) +
               COUNT(CASE WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 1 END) +
               COUNT(CASE WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 1 END) as wins,
               COUNT(CASE WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1 END) as draws,
               COUNT(CASE WHEN (m.result = 'WIN_P1' AND m.player2_id = p.id) OR 
                              (m.result = 'WIN_P2' AND m.player1_id = p.id) THEN 1 END) as losses,
               COUNT(CASE WHEN m.result IS NOT NULL AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1 END) as matches_played,
               COALESCE(SUM(
                 CASE 
                   WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
                   WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
                   WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
                   WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 2
                   ELSE 0
                 END
               ), 0) as points
        FROM players p
        INNER JOIN tournament_players tp ON p.id = tp.player_id
        LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) AND m.tournament_id = tp.tournament_id
        WHERE tp.tournament_id = $1 AND tp.dropped = false
        GROUP BY p.id, p.name
      `,
        [tournamentId]
      );

      // Calculate opponent resistance for each player
      const playersWithResistance = await Promise.all(
        basicStandings.rows.map(async (player) => {
          // Get all opponents for this player
          const opponentsResult = await client.query(
            `
            SELECT DISTINCT 
              CASE 
                WHEN m.player1_id = $1 THEN m.player2_id
                WHEN m.player2_id = $1 THEN m.player1_id
              END as opponent_id
            FROM matches m
            WHERE m.tournament_id = $2 
              AND (m.player1_id = $1 OR m.player2_id = $1)
              AND m.result IS NOT NULL
              AND m.result != 'BYE'
          `,
            [player.id, tournamentId]
          );

          const opponentIds = opponentsResult.rows
            .map((row) => row.opponent_id)
            .filter((id) => id !== null);

          if (opponentIds.length === 0) {
            return {
              ...player,
              opponent_resistance: 0.0,
              opponent_opponent_resistance: 0.0,
            };
          }

          // Calculate average points of opponents
          const opponentPointsResult = await client.query(
            `
            SELECT AVG(opponent_points.points) as avg_opponent_points
            FROM (
              SELECT p.id,
                     COALESCE(SUM(
                       CASE 
                         WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
                         WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
                         WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
                         WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 2
                         ELSE 0
                       END
                     ), 0) as points
              FROM players p
              INNER JOIN tournament_players tp ON p.id = tp.player_id
              LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) AND m.tournament_id = tp.tournament_id
              WHERE p.id = ANY($1) AND tp.tournament_id = $2 AND tp.dropped = false
              GROUP BY p.id
            ) opponent_points
          `,
            [opponentIds, tournamentId]
          );

          const avgOpponentPoints = parseFloat(
            opponentPointsResult.rows[0]?.avg_opponent_points || "0"
          );

          // Calculate opponent's opponent's resistance
          const opponentOpponentsResult = await client.query(
            `
            SELECT DISTINCT 
              CASE 
                WHEN m.player1_id = ANY($1) THEN m.player2_id
                WHEN m.player2_id = ANY($1) THEN m.player1_id
              END as opponent_opponent_id
            FROM matches m
            WHERE m.tournament_id = $2 
              AND (m.player1_id = ANY($1) OR m.player2_id = ANY($1))
              AND m.result IS NOT NULL
              AND m.result != 'BYE'
              AND m.player1_id != $3 AND m.player2_id != $3
          `,
            [opponentIds, tournamentId, player.id]
          );

          const opponentOpponentIds = opponentOpponentsResult.rows
            .map((row) => row.opponent_opponent_id)
            .filter((id) => id !== null && !opponentIds.includes(id));

          let avgOpponentOpponentPoints = 0;
          if (opponentOpponentIds.length > 0) {
            const opponentOpponentPointsResult = await client.query(
              `
              SELECT AVG(opponent_opponent_points.points) as avg_opponent_opponent_points
              FROM (
                SELECT p.id,
                       COALESCE(SUM(
                         CASE 
                           WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
                           WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
                           WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
                           WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 2
                           ELSE 0
                         END
                       ), 0) as points
                FROM players p
                INNER JOIN tournament_players tp ON p.id = tp.player_id
                LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) AND m.tournament_id = tp.tournament_id
                WHERE p.id = ANY($1) AND tp.tournament_id = $2 AND tp.dropped = false
                GROUP BY p.id
              ) opponent_opponent_points
            `,
              [opponentOpponentIds, tournamentId]
            );
            avgOpponentOpponentPoints = parseFloat(
              opponentOpponentPointsResult.rows[0]
                ?.avg_opponent_opponent_points || "0"
            );
          }

          // Convert to percentages (assuming max possible points is 3 per match)
          const maxPossiblePoints = 3 * player.matches_played;
          const opponentResistance =
            maxPossiblePoints > 0 ? avgOpponentPoints / maxPossiblePoints : 0;
          const opponentOpponentResistance =
            maxPossiblePoints > 0
              ? avgOpponentOpponentPoints / maxPossiblePoints
              : 0;

          return {
            ...player,
            opponent_resistance: opponentResistance,
            opponent_opponent_resistance: opponentOpponentResistance,
          };
        })
      );

      // Sort by points, then by opponent resistance, then by opponent's opponent's resistance
      playersWithResistance.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.opponent_resistance !== a.opponent_resistance)
          return b.opponent_resistance - a.opponent_resistance;
        if (b.opponent_opponent_resistance !== a.opponent_opponent_resistance)
          return (
            b.opponent_opponent_resistance - a.opponent_opponent_resistance
          );
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.draws !== a.draws) return b.draws - a.draws;
        return a.name.localeCompare(b.name);
      });

      return playersWithResistance;
    } finally {
      client.release();
    }
  }

  async createAutomaticPairings(
    tournamentId: number,
    roundNumber: number
  ): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      // Get player standings for this round
      const standingsResult = await client.query(
        `
        SELECT 
          p.id, 
          p.name,
          p.static_seating,
          COALESCE(SUM(
            CASE 
              WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
              WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
              WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
              WHEN m.result = 'BYE' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 2
              ELSE 0
            END
          ), 0) as points,
          COUNT(m.id) as matches_played
        FROM players p
        INNER JOIN tournament_players tp ON p.id = tp.player_id
        LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) 
          AND m.tournament_id = $1 
          AND m.round_number < $2
        WHERE tp.tournament_id = $1 
          AND tp.dropped = false
          AND tp.started_round <= $2
          AND p.id NOT IN (
            SELECT player1_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player1_id IS NOT NULL
            UNION
            SELECT player2_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player2_id IS NOT NULL
          )
        GROUP BY p.id, p.name, p.static_seating
        ORDER BY points DESC, p.name ASC
      `,
        [tournamentId, roundNumber]
      );

      let players = standingsResult.rows;
      const pairings = [];

      // For first round, implement special pairing logic
      if (roundNumber === 1) {
        // Separate static and dynamic seating players
        const staticSeatingPlayers = players.filter((p) => p.static_seating);
        const dynamicSeatingPlayers = players.filter((p) => !p.static_seating);

        // Randomize both groups
        const shuffleArray = (arr: any[]) => {
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
        };

        shuffleArray(staticSeatingPlayers);
        shuffleArray(dynamicSeatingPlayers);

        // First, pair static seating players with dynamic seating players
        const paired = new Set<number>();

        // Pair static seating players with dynamic seating players first
        for (const staticPlayer of staticSeatingPlayers) {
          if (paired.has(staticPlayer.id)) continue;

          // Find an unpaired dynamic seating player
          const availableDynamicPlayer = dynamicSeatingPlayers.find(
            (p) => !paired.has(p.id)
          );

          if (availableDynamicPlayer) {
            const match = await this.createMatch({
              tournament_id: tournamentId,
              round_number: roundNumber,
              player1_id: staticPlayer.id,
              player2_id: availableDynamicPlayer.id,
            });
            pairings.push({
              match_id: match,
              player1: staticPlayer,
              player2: availableDynamicPlayer,
            });
            paired.add(staticPlayer.id);
            paired.add(availableDynamicPlayer.id);
          }
        }

        // Pair remaining dynamic seating players with each other
        const remainingDynamicPlayers = dynamicSeatingPlayers.filter(
          (p) => !paired.has(p.id)
        );
        for (let i = 0; i < remainingDynamicPlayers.length - 1; i += 2) {
          const match = await this.createMatch({
            tournament_id: tournamentId,
            round_number: roundNumber,
            player1_id: remainingDynamicPlayers[i].id,
            player2_id: remainingDynamicPlayers[i + 1].id,
          });
          pairings.push({
            match_id: match,
            player1: remainingDynamicPlayers[i],
            player2: remainingDynamicPlayers[i + 1],
          });
          paired.add(remainingDynamicPlayers[i].id);
          paired.add(remainingDynamicPlayers[i + 1].id);
        }

        // Handle any remaining unpaired players (odd number)
        const allUnpairedPlayers = players.filter((p) => !paired.has(p.id));
        if (allUnpairedPlayers.length === 1) {
          // For first round, randomly select a player for bye
          const byePlayer = allUnpairedPlayers[0];
          const byeMatch = await this.createMatch({
            tournament_id: tournamentId,
            round_number: roundNumber,
            player1_id: byePlayer.id,
            player2_id: undefined,
          });
          pairings.push({
            match_id: byeMatch,
            player1: byePlayer,
            player2: null,
            is_bye: true,
          });
        }

        return pairings;
      }

      // Swiss system pairing algorithm with floating down for subsequent rounds
      return await this.createSwissPairingsWithFloatingDown(
        client,
        tournamentId,
        roundNumber,
        players
      );
    } finally {
      client.release();
    }
  }

  private async createSwissPairingsWithFloatingDown(
    client: any,
    tournamentId: number,
    roundNumber: number,
    players: any[]
  ): Promise<any[]> {
    const pairings = [];
    const paired = new Set<number>();

    // Group players by points (score brackets)
    const scoreBrackets = new Map<number, any[]>();
    for (const player of players) {
      const points = player.points;
      if (!scoreBrackets.has(points)) {
        scoreBrackets.set(points, []);
      }
      scoreBrackets.get(points)!.push(player);
    }

    // Sort brackets by points (highest to lowest)
    const sortedBrackets = Array.from(scoreBrackets.entries()).sort(
      ([a], [b]) => b - a
    );

    console.log(
      `🎯 Swiss Pairing with Floating Down - Tournament ${tournamentId}, Round ${roundNumber}`
    );
    console.log(`👥 Total players to pair: ${players.length}`);
    console.log(
      `📊 Score brackets: ${sortedBrackets
        .map(([points, players]) => `${points}pts(${players.length} players)`)
        .join(" → ")}`
    );

    // Process each bracket from highest to lowest
    for (let i = 0; i < sortedBrackets.length; i++) {
      const [currentPoints, currentBracketPlayers] = sortedBrackets[i];
      let unpairedInBracket = currentBracketPlayers.filter(
        (p) => !paired.has(p.id)
      );

      console.log(
        `🏆 Processing ${currentPoints}pt bracket: ${unpairedInBracket.length} unpaired players`
      );

      // Try to pair all players in current bracket
      const bracketPairings = await this.pairPlayersInBracket(
        client,
        tournamentId,
        roundNumber,
        unpairedInBracket,
        paired
      );
      pairings.push(...bracketPairings);

      // Get any remaining unpaired players from this bracket
      const remainingUnpaired = unpairedInBracket.filter(
        (p) => !paired.has(p.id)
      );

      // Float down remaining unpaired players to lower brackets
      if (remainingUnpaired.length > 0 && i < sortedBrackets.length - 1) {
        console.log(
          `⬇️ Floating down ${remainingUnpaired.length} players from ${currentPoints}pt bracket`
        );
        console.log(
          `⬇️ Floating players: ${remainingUnpaired
            .map((p) => `${p.name} (ID: ${p.id})`)
            .join(", ")}`
        );

        // Float down through all remaining brackets
        let playersToFloat = [...remainingUnpaired];

        for (let j = i + 1; j < sortedBrackets.length; j++) {
          const [nextPoints, nextBracketPlayers] = sortedBrackets[j];

          console.log(
            `⬇️ Attempting to pair ${playersToFloat.length} floated players in ${nextPoints}pt bracket`
          );
          console.log(
            `⬇️ Next bracket players: ${nextBracketPlayers
              .map((p) => `${p.name} (ID: ${p.id})`)
              .join(", ")}`
          );

          // Combine next bracket players with floated down players
          const combinedBracket = [...nextBracketPlayers, ...playersToFloat];

          // Re-pair the combined bracket
          const rePairings = await this.pairPlayersInBracket(
            client,
            tournamentId,
            roundNumber,
            combinedBracket,
            paired
          );

          console.log(
            `⬇️ Created ${rePairings.length} new pairings in ${nextPoints}pt bracket`
          );

          // Replace any existing pairings from the next bracket with new ones
          // Remove old pairings from this bracket
          const pairingsToRemove = pairings.filter(
            (p) =>
              p.player1 &&
              p.player2 &&
              nextBracketPlayers.some(
                (np) => np.id === p.player1.id || np.id === p.player2.id
              )
          );

          console.log(
            `⬇️ Removing ${pairingsToRemove.length} old pairings from ${nextPoints}pt bracket`
          );

          for (const pairingToRemove of pairingsToRemove) {
            const index = pairings.findIndex(
              (p) => p.match_id === pairingToRemove.match_id
            );
            if (index !== -1) {
              pairings.splice(index, 1);
            }
          }

          // Add new pairings
          pairings.push(...rePairings);

          // Update the sorted brackets array to reflect the changes
          sortedBrackets[j] = [nextPoints, combinedBracket];

          // Check if there are still unpaired players to float down further
          playersToFloat = combinedBracket.filter((p) => !paired.has(p.id));

          if (playersToFloat.length === 0) {
            console.log(
              `✅ All floated players successfully paired in ${nextPoints}pt bracket`
            );
            break; // All players paired, no need to continue floating down
          }

          console.log(
            `⬇️ ${
              playersToFloat.length
            } players still unpaired, continuing to next bracket: ${playersToFloat
              .map((p) => `${p.name} (ID: ${p.id})`)
              .join(", ")}`
          );
        }
      }
    }

    // Handle any remaining unpaired players - give bye to lowest scoring
    const allUnpairedPlayers = players.filter((p) => !paired.has(p.id));
    if (allUnpairedPlayers.length > 0) {
      console.log(
        `🎲 Found ${
          allUnpairedPlayers.length
        } unpaired players: ${allUnpairedPlayers.map((p) => p.name).join(", ")}`
      );

      // Get detailed standings for proper tiebreaker resolution
      const detailedStandings = await this.getDetailedStandingsForBye(
        client,
        tournamentId,
        roundNumber
      );

      // Find the lowest scoring player among unpaired players
      const byePlayer = this.selectLowestScoringPlayer(
        allUnpairedPlayers,
        detailedStandings
      );

      console.log(
        `🎲 Assigning bye to lowest scoring unpaired player: ${byePlayer.name}`
      );

      const byeMatch = await this.createMatch({
        tournament_id: tournamentId,
        round_number: roundNumber,
        player1_id: byePlayer.id,
        player2_id: undefined, // No opponent for bye
      });
      pairings.push({
        match_id: byeMatch,
        player1: byePlayer,
        player2: null,
        is_bye: true,
      });

      // Log any remaining unpaired players (should be 0 if odd number, or 1+ if even number)
      const remainingUnpaired = allUnpairedPlayers.filter(
        (p) => p.id !== byePlayer.id
      );
      if (remainingUnpaired.length > 0) {
        console.log(
          `⚠️  ${
            remainingUnpaired.length
          } players still unpaired after bye assignment: ${remainingUnpaired
            .map((p) => p.name)
            .join(", ")}`
        );
      }
    }

    console.log(`✅ Pairing complete: ${pairings.length} matches created`);

    // Log final summary
    const finalUnpaired = players.filter((p) => !paired.has(p.id));
    if (finalUnpaired.length > 0) {
      console.log(
        `⚠️  Final unpaired players: ${finalUnpaired
          .map((p) => p.name)
          .join(", ")}`
      );
    } else {
      console.log(`✅ All players successfully paired or assigned bye`);
    }

    return pairings;
  }

  private async pairPlayersInBracket(
    client: any,
    tournamentId: number,
    roundNumber: number,
    bracketPlayers: any[],
    paired: Set<number>
  ): Promise<any[]> {
    const pairings = [];

    for (let i = 0; i < bracketPlayers.length; i++) {
      if (paired.has(bracketPlayers[i].id)) continue;

      // Find the best opponent for this player
      let bestOpponent = null;
      let bestScore = -1;
      let bestConstraintViolations = Infinity;

      for (let j = i + 1; j < bracketPlayers.length; j++) {
        if (paired.has(bracketPlayers[j].id)) continue;

        // Prevent self-pairing
        if (bracketPlayers[i].id === bracketPlayers[j].id) continue;

        // Check if they've already played each other
        const alreadyPlayed = await this.havePlayersPlayed(
          client,
          tournamentId,
          bracketPlayers[i].id,
          bracketPlayers[j].id
        );

        // Skip if they've already played - this is a hard constraint
        if (alreadyPlayed) {
          console.log(
            `🚫 Skipping ${bracketPlayers[i].name} vs ${bracketPlayers[j].name} - already played`
          );
          continue;
        }

        // Check static seating constraint
        const staticSeatingConflict =
          bracketPlayers[i].static_seating && bracketPlayers[j].static_seating;

        // Calculate constraint violations (0 = perfect, 1 = one violation)
        let constraintViolations = 0;
        if (staticSeatingConflict) constraintViolations++;

        // Calculate pairing score (prefer similar points)
        const pointDiff = Math.abs(
          bracketPlayers[i].points - bracketPlayers[j].points
        );
        const score = -pointDiff; // Lower difference = higher score

        // Prioritize by constraint violations first, then by score
        if (
          constraintViolations < bestConstraintViolations ||
          (constraintViolations === bestConstraintViolations &&
            score > bestScore)
        ) {
          bestConstraintViolations = constraintViolations;
          bestScore = score;
          bestOpponent = bracketPlayers[j];
        }
      }

      if (bestOpponent) {
        // Final validation to prevent self-pairing
        if (bracketPlayers[i].id !== bestOpponent.id) {
          // Additional validation to ensure valid player IDs
          if (!bracketPlayers[i].id || !bestOpponent.id) {
            console.error(
              `❌ Invalid player IDs detected: player1_id=${bracketPlayers[i].id}, player2_id=${bestOpponent.id}`
            );
            continue;
          }

          // Log if we're making a pairing with static seating constraint violation
          const staticSeatingConflict =
            bracketPlayers[i].static_seating && bestOpponent.static_seating;

          if (staticSeatingConflict) {
            console.log(
              `⚠️  Making pairing with static seating constraint violation: ${bracketPlayers[i].name} vs ${bestOpponent.name}`
            );
          }

          console.log(
            `✅ Creating match: ${bracketPlayers[i].name} vs ${bestOpponent.name} (Round ${roundNumber})`
          );
          const match = await this.createMatch({
            tournament_id: tournamentId,
            round_number: roundNumber,
            player1_id: bracketPlayers[i].id,
            player2_id: bestOpponent.id,
          });
          pairings.push({
            match_id: match,
            player1: bracketPlayers[i],
            player2: bestOpponent,
          });
          paired.add(bracketPlayers[i].id);
          paired.add(bestOpponent.id);
        } else {
          console.error(
            `❌ Self-pairing detected and prevented: Player ${bracketPlayers[i].id} (${bracketPlayers[i].name})`
          );
        }
      } else {
        console.log(
          `⚠️  No opponent found for ${bracketPlayers[i].name} (ID: ${bracketPlayers[i].id}) in bracket`
        );
      }
    }

    return pairings;
  }

  private async havePlayersPlayed(
    client: any,
    tournamentId: number,
    player1Id: number,
    player2Id: number
  ): Promise<boolean> {
    const result = await client.query(
      `
      SELECT COUNT(*) as count
      FROM matches 
      WHERE tournament_id = $1 
        AND ((player1_id = $2 AND player2_id = $3) OR (player1_id = $3 AND player2_id = $2))
      `,
      [tournamentId, player1Id, player2Id]
    );
    return result.rows[0].count > 0;
  }

  private async getDetailedStandingsForBye(
    client: any,
    tournamentId: number,
    roundNumber: number
  ): Promise<any[]> {
    const result = await client.query(
      `
      SELECT 
        p.id, 
        p.name,
        COUNT(CASE WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 1 END) +
        COUNT(CASE WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 1 END) +
        COUNT(CASE WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 1 END) as wins,
        COUNT(CASE WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1 END) as draws,
        COUNT(CASE WHEN (m.result = 'WIN_P1' AND m.player2_id = p.id) OR 
                       (m.result = 'WIN_P2' AND m.player1_id = p.id) THEN 1 END) as losses,
        COALESCE(SUM(
          CASE 
            WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
            WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
            WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
            WHEN m.result = 'BYE' AND m.player1_id = p.id THEN 2
            ELSE 0
          END
        ), 0) as points
      FROM players p
      INNER JOIN tournament_players tp ON p.id = tp.player_id
      LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) 
        AND m.tournament_id = $1 
        AND m.round_number < $2
      WHERE tp.tournament_id = $1 
        AND tp.dropped = false
        AND tp.started_round <= $2
      GROUP BY p.id, p.name
      ORDER BY points ASC, wins ASC, draws ASC, p.name ASC
      `,
      [tournamentId, roundNumber]
    );
    return result.rows;
  }

  private selectLowestScoringPlayer(
    unpairedPlayers: any[],
    detailedStandings: any[]
  ): any {
    // Create a map of player standings for quick lookup
    const standingsMap = new Map();
    detailedStandings.forEach((player) => {
      standingsMap.set(player.id, player);
    });

    // Sort unpaired players by their standings (lowest first)
    const sortedUnpairedPlayers = unpairedPlayers.sort((a, b) => {
      const aStanding = standingsMap.get(a.id);
      const bStanding = standingsMap.get(b.id);

      if (!aStanding || !bStanding) {
        // If we can't find standings, fall back to name comparison
        return a.name.localeCompare(b.name);
      }

      // Compare points (ascending - lowest first)
      if (aStanding.points !== bStanding.points) {
        return aStanding.points - bStanding.points;
      }

      // Compare wins (ascending - lowest first)
      if (aStanding.wins !== bStanding.wins) {
        return aStanding.wins - bStanding.wins;
      }

      // Compare draws (ascending - lowest first)
      if (aStanding.draws !== bStanding.draws) {
        return aStanding.draws - bStanding.draws;
      }

      // If still tied, use name as final tiebreaker
      return a.name.localeCompare(b.name);
    });

    // Return the lowest scoring player (first in sorted array)
    return sortedUnpairedPlayers[0];
  }

  async updateRoundStatus(
    tournamentId: number,
    roundNumber: number,
    status: "pending" | "started" | "completed"
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE matches SET round_status = $1, updated_at = CURRENT_TIMESTAMP WHERE tournament_id = $2 AND round_number = $3",
        [status, tournamentId, roundNumber]
      );
    } finally {
      client.release();
    }
  }

  async getRoundStatus(
    tournamentId: number,
    roundNumber: number
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT round_status FROM matches WHERE tournament_id = $1 AND round_number = $2 LIMIT 1",
        [tournamentId, roundNumber]
      );
      return result.rows[0]?.round_status || "pending";
    } finally {
      client.release();
    }
  }

  async deleteMatch(matchId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM matches WHERE id = $1", [matchId]);
    } finally {
      client.release();
    }
  }

  async updateMatch(
    matchId: number,
    player1Id?: number,
    player2Id?: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE matches SET player1_id = $1, player2_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [player1Id, player2Id, matchId]
      );
    } finally {
      client.release();
    }
  }

  async getUnpairedPlayersForRound(
    tournamentId: number,
    roundNumber: number
  ): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT p.id, p.name
        FROM players p
        INNER JOIN tournament_players tp ON p.id = tp.player_id
        WHERE tp.tournament_id = $1 
          AND tp.dropped = false
          AND tp.started_round <= $2
          AND p.id NOT IN (
            SELECT player1_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player1_id IS NOT NULL
            UNION
            SELECT player2_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player2_id IS NOT NULL
          )
        ORDER BY p.name
      `,
        [tournamentId, roundNumber]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Collaborator methods (simplified - return empty arrays for now)
  async addTournamentCollaborator(
    tournamentId: number,
    userId: number,
    role: "editor" | "viewer"
  ): Promise<void> {
    // Implementation would require a separate collaborators table
    console.log(
      `Adding collaborator ${userId} to tournament ${tournamentId} with role ${role}`
    );
  }

  async removeTournamentCollaborator(
    tournamentId: number,
    userId: number
  ): Promise<void> {
    console.log(
      `Removing collaborator ${userId} from tournament ${tournamentId}`
    );
  }

  async getTournamentCollaborators(tournamentId: number): Promise<any[]> {
    return [];
  }

  async addLeagueCollaborator(
    leagueId: number,
    userId: number,
    role: "editor" | "viewer"
  ): Promise<void> {
    console.log(
      `Adding collaborator ${userId} to league ${leagueId} with role ${role}`
    );
  }

  async removeLeagueCollaborator(
    leagueId: number,
    userId: number
  ): Promise<void> {
    console.log(`Removing collaborator ${userId} from league ${leagueId}`);
  }

  async getLeagueCollaborators(leagueId: number): Promise<any[]> {
    return [];
  }

  async addPlayerCollaborator(
    playerId: number,
    userId: number,
    role: "editor" | "viewer"
  ): Promise<void> {
    console.log(
      `Adding collaborator ${userId} to player ${playerId} with role ${role}`
    );
  }

  async removePlayerCollaborator(
    playerId: number,
    userId: number
  ): Promise<void> {
    console.log(`Removing collaborator ${userId} from player ${playerId}`);
  }

  async getPlayerCollaborators(playerId: number): Promise<any[]> {
    return [];
  }
}
