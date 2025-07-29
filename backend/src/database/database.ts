import sqlite3 from "sqlite3";
import path from "path";

export class Database {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(__dirname, "../../data/tournament.db");
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
      } else {
        console.log("✅ Connected to SQLite database");
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    // Create users table (TOs only)
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create leagues table
    const createLeaguesTable = `
      CREATE TABLE IF NOT EXISTS leagues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create tournaments table
    const createTournamentsTable = `
      CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        league_id INTEGER,
        bracket_type TEXT NOT NULL DEFAULT 'SWISS' CHECK(bracket_type IN ('SWISS', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION')),
        is_completed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (league_id) REFERENCES leagues (id)
      )
    `;

    // Create players table
    const createPlayersTable = `
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        static_seating BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create tournament_players table (junction table)
    const createTournamentPlayersTable = `
      CREATE TABLE IF NOT EXISTS tournament_players (
        player_id INTEGER,
        tournament_id INTEGER,
        dropped BOOLEAN DEFAULT FALSE,
        started_round INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, tournament_id),
        FOREIGN KEY (player_id) REFERENCES players (id),
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
      )
    `;

    // Create matches table
    const createMatchesTable = `
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER,
        round_number INTEGER NOT NULL,
        player1_id INTEGER,
        player2_id INTEGER,
        winner_id INTEGER,
        result TEXT CHECK(result IN ('WIN_P1', 'WIN_P2', 'DRAW', 'BYE')),
        modified_by_to BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
        FOREIGN KEY (player1_id) REFERENCES players (id),
        FOREIGN KEY (player2_id) REFERENCES players (id),
        FOREIGN KEY (winner_id) REFERENCES players (id)
      )
    `;

    this.db.serialize(() => {
      this.db.run(createUsersTable, (err) => {
        if (err) {
          console.error("Error creating users table:", err.message);
        } else {
          console.log("✅ Users table created/verified");
        }
      });

      this.db.run(createLeaguesTable, (err) => {
        if (err) {
          console.error("Error creating leagues table:", err.message);
        } else {
          console.log("✅ Leagues table created/verified");
        }
      });

      this.db.run(createTournamentsTable, (err) => {
        if (err) {
          console.error("Error creating tournaments table:", err.message);
        } else {
          console.log("✅ Tournaments table created/verified");
        }
      });

      this.db.run(createPlayersTable, (err) => {
        if (err) {
          console.error("Error creating players table:", err.message);
        } else {
          console.log("✅ Players table created/verified");
        }
      });

      this.db.run(createTournamentPlayersTable, (err) => {
        if (err) {
          console.error(
            "Error creating tournament_players table:",
            err.message
          );
        } else {
          console.log("✅ Tournament_players table created/verified");
        }
      });

      this.db.run(createMatchesTable, (err) => {
        if (err) {
          console.error("Error creating matches table:", err.message);
        } else {
          console.log("✅ Matches table created/verified");
        }
      });
    });
  }

  // User methods
  async createUser(user: {
    name: string;
    email: string;
    password: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
      `;

      this.db.run(sql, [user.name, user.email, user.password], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getUserByEmail(email: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const sql = "SELECT * FROM users WHERE email = ?";

      this.db.get(sql, [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getUsers(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = "SELECT * FROM users ORDER BY created_at DESC";

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // League methods
  async createLeague(league: {
    name: string;
    description?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO leagues (name, description)
        VALUES (?, ?)
      `;

      this.db.run(
        sql,
        [league.name, league.description || null],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getLeagues(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = "SELECT * FROM leagues ORDER BY created_at DESC";

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Tournament methods
  async createTournament(tournament: {
    name: string;
    date: string;
    league_id?: number;
    bracket_type?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tournaments (name, date, league_id, bracket_type)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          tournament.name,
          tournament.date,
          tournament.league_id || null,
          tournament.bracket_type || "SWISS",
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getTournaments(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT t.*, l.name as league_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        ORDER BY t.created_at DESC
      `;

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getTournamentById(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT t.*, l.name as league_name 
        FROM tournaments t 
        LEFT JOIN leagues l ON t.league_id = l.id 
        WHERE t.id = ?
      `;

      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateTournamentCompletion(
    id: number,
    isCompleted: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE tournaments 
        SET is_completed = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;

      this.db.run(sql, [isCompleted, id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Player methods
  async createPlayer(player: {
    name: string;
    static_seating?: boolean;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO players (name, static_seating)
        VALUES (?, ?)
      `;

      this.db.run(
        sql,
        [player.name, player.static_seating || false],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getPlayers(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = "SELECT * FROM players ORDER BY name";

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // TournamentPlayer methods
  async addPlayerToTournament(tournamentPlayer: {
    player_id: number;
    tournament_id: number;
    started_round?: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tournament_players (player_id, tournament_id, started_round)
        VALUES (?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          tournamentPlayer.player_id,
          tournamentPlayer.tournament_id,
          tournamentPlayer.started_round || 1,
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async addMultiplePlayersToTournament(
    players: {
      player_id: number;
      tournament_id: number;
      started_round?: number;
    }[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (players.length === 0) {
        resolve();
        return;
      }

      const placeholders = players.map(() => "(?, ?, ?)").join(", ");
      const sql = `
        INSERT INTO tournament_players (player_id, tournament_id, started_round)
        VALUES ${placeholders}
      `;

      const values = players.flatMap((player) => [
        player.player_id,
        player.tournament_id,
        player.started_round || 1,
      ]);

      this.db.run(sql, values, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getTournamentPlayers(tournamentId: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT p.*, tp.dropped, tp.started_round
        FROM players p
        INNER JOIN tournament_players tp ON p.id = tp.player_id
        WHERE tp.tournament_id = ?
        ORDER BY p.name
      `;

      this.db.all(sql, [tournamentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updatePlayerDropStatus(
    tournamentId: number,
    playerId: number,
    dropped: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE tournament_players 
        SET dropped = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE tournament_id = ? AND player_id = ?
      `;

      this.db.run(sql, [dropped, tournamentId, playerId], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Match methods
  async createMatch(match: {
    tournament_id: number;
    round_number: number;
    player1_id?: number;
    player2_id?: number;
    result?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO matches (tournament_id, round_number, player1_id, player2_id, result)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          match.tournament_id,
          match.round_number,
          match.player1_id || null,
          match.player2_id || null,
          match.result || null,
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getMatchesByTournament(tournamentId: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.*, 
               p1.name as player1_name,
               p2.name as player2_name,
               w.name as winner_name
        FROM matches m
        LEFT JOIN players p1 ON m.player1_id = p1.id
        LEFT JOIN players p2 ON m.player2_id = p2.id
        LEFT JOIN players w ON m.winner_id = w.id
        WHERE m.tournament_id = ?
        ORDER BY m.round_number, m.id
      `;

      this.db.all(sql, [tournamentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateMatchResult(
    matchId: number,
    result: string,
    winnerId?: number,
    modifiedByTo: boolean = true
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE matches 
        SET result = ?, winner_id = ?, modified_by_to = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;

      this.db.run(
        sql,
        [result, winnerId || null, modifiedByTo, matchId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Close database connection
  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("✅ Database connection closed");
      }
    });
  }

  // Method for running raw SQL queries (for migrations)
  async runRawQuery(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  // Method for getting a single row (for migrations)
  async getRawQuery(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
}
