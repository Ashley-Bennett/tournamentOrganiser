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
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'active', 'completed')),
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
        trainer_id TEXT,
        birth_year INTEGER,
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
        round_status TEXT DEFAULT 'pending' CHECK(round_status IN ('pending', 'started', 'completed')),
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
    status?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tournaments (name, date, league_id, bracket_type, status)
        VALUES (?, ?, ?, ?, ?)
      `;
      this.db.run(
        sql,
        [
          tournament.name,
          tournament.date,
          tournament.league_id || null,
          tournament.bracket_type || "SWISS",
          tournament.status || "new",
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
        SET is_completed = ?, status = CASE WHEN ? THEN 'completed' ELSE status END, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;
      this.db.run(sql, [isCompleted, isCompleted, id], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async updateTournamentStatusToActive(tournamentId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE tournaments SET status = 'active' WHERE id = ? AND status = 'new'`;
      this.db.run(sql, [tournamentId], function (err) {
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
    trainer_id?: string;
    birth_year?: number;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO players (name, static_seating, trainer_id, birth_year)
        VALUES (?, ?, ?, ?)
      `;
      this.db.run(
        sql,
        [
          player.name,
          player.static_seating || false,
          player.trainer_id || null,
          player.birth_year || null,
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

  async getPlayers(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM players
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

  async updatePlayer(player: {
    id: number;
    name?: string;
    static_seating?: boolean;
    trainer_id?: string;
    birth_year?: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE players
        SET
          name = COALESCE(?, name),
          static_seating = COALESCE(?, static_seating),
          trainer_id = COALESCE(?, trainer_id),
          birth_year = COALESCE(?, birth_year),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      const params = [
        player.name ?? null,
        player.static_seating ?? null,
        player.trainer_id ?? null,
        player.birth_year ?? null,
        player.id,
      ];
      console.log("updatePlayer SQL:", sql);
      console.log("updatePlayer params:", params);
      this.db.run(sql, params, function (err) {
        if (err) {
          console.error("updatePlayer error:", err);
          reject(err);
        } else {
          resolve();
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

  async updatePlayerStartedRound(
    tournamentId: number,
    playerId: number,
    started_round: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE tournament_players
        SET started_round = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tournament_id = ? AND player_id = ?
      `;
      this.db.run(sql, [started_round, tournamentId, playerId], function (err) {
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
        INSERT INTO matches (
          tournament_id, round_number, player1_id, player2_id, result, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

  // Get player standings for a tournament
  async getPlayerStandings(tournamentId: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        WITH player_stats AS (
          SELECT 
            p.id,
            p.name,
            p.static_seating,
            tp.dropped,
            tp.started_round,
            COALESCE(SUM(
              CASE 
                WHEN m.player1_id = p.id AND m.result = 'WIN_P1' THEN 1
                WHEN m.player2_id = p.id AND m.result = 'WIN_P2' THEN 1
                WHEN m.player1_id = p.id AND m.result = 'DRAW' THEN 0.5
                WHEN m.player2_id = p.id AND m.result = 'DRAW' THEN 0.5
                WHEN m.player1_id = p.id AND m.result = 'BYE' THEN 1
                WHEN m.player2_id = p.id AND m.result = 'BYE' THEN 1
                ELSE 0
              END
            ), 0) as points,
            COUNT(m.id) as matches_played
          FROM players p
          INNER JOIN tournament_players tp ON p.id = tp.player_id
          LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) 
            AND m.tournament_id = tp.tournament_id
          WHERE tp.tournament_id = ?
          GROUP BY p.id, p.name, p.static_seating, tp.dropped, tp.started_round
        )
        SELECT * FROM player_stats
        WHERE dropped = FALSE
        ORDER BY points ASC, name ASC
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

  // Create automatic pairings for a round
  async createAutomaticPairings(
    tournamentId: number,
    roundNumber: number
  ): Promise<any[]> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get player standings
        const standings = await this.getPlayerStandings(tournamentId);

        if (standings.length < 2) {
          reject(new Error("Need at least 2 players to create pairings"));
          return;
        }

        // Check if this is the first round
        const existingMatches = await this.getMatchesByTournament(tournamentId);
        const isFirstRound = existingMatches.length === 0;

        let pairings: any[] = [];

        console.log("isFirstRound", isFirstRound);

        if (isFirstRound) {
          console.log("=== STARTING FIRST ROUND PAIRING ===");
          console.log(
            "Initial standings:",
            standings.map((p) => `${p.name} (static:${p.static_seating})`)
          );

          // For first round, pair by static seating (static players should not be paired together)
          // Shuffle the players to make pairings more random
          const shuffleArray = (array: any[]) => {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
          };

          const shuffledStandings = shuffleArray(standings);
          const staticPlayers = shuffledStandings.filter(
            (p) => p.static_seating
          );
          const dynamicPlayers = shuffledStandings.filter(
            (p) => !p.static_seating
          );

          console.log(
            "Shuffled static players:",
            staticPlayers.map((p) => p.name)
          );
          console.log(
            "Shuffled dynamic players:",
            dynamicPlayers.map((p) => p.name)
          );

          // Track used players to prevent duplicates
          const usedPlayers = new Set<number>();

          // Pair static players with dynamic players first
          const minStaticDynamic = Math.min(
            staticPlayers.length,
            dynamicPlayers.length
          );
          for (let i = 0; i < minStaticDynamic; i++) {
            console.log(
              `Pairing ${staticPlayers[i].name} vs ${dynamicPlayers[i].name}`
            );
            pairings.push({
              player1_id: staticPlayers[i].id,
              player1_name: staticPlayers[i].name,
              player2_id: dynamicPlayers[i].id,
              player2_name: dynamicPlayers[i].name,
            });
            usedPlayers.add(staticPlayers[i].id);
            usedPlayers.add(dynamicPlayers[i].id);
          }

          // Handle remaining players
          const remainingStatic = staticPlayers.slice(minStaticDynamic);
          const remainingDynamic = dynamicPlayers.slice(minStaticDynamic);

          console.log(
            "Remaining static players:",
            remainingStatic.map((p) => p.name)
          );
          console.log(
            "Remaining dynamic players:",
            remainingDynamic.map((p) => p.name)
          );

          // Pair remaining static players with each other if necessary
          for (let i = 0; i < remainingStatic.length - 1; i += 2) {
            console.log(
              `Pairing remaining static: ${remainingStatic[i].name} vs ${
                remainingStatic[i + 1].name
              }`
            );
            pairings.push({
              player1_id: remainingStatic[i].id,
              player1_name: remainingStatic[i].name,
              player2_id: remainingStatic[i + 1].id,
              player2_name: remainingStatic[i + 1].name,
            });
            usedPlayers.add(remainingStatic[i].id);
            usedPlayers.add(remainingStatic[i + 1].id);
          }

          // Pair remaining dynamic players
          for (let i = 0; i < remainingDynamic.length - 1; i += 2) {
            console.log(
              `Pairing remaining dynamic: ${remainingDynamic[i].name} vs ${
                remainingDynamic[i + 1].name
              }`
            );
            pairings.push({
              player1_id: remainingDynamic[i].id,
              player1_name: remainingDynamic[i].name,
              player2_id: remainingDynamic[i + 1].id,
              player2_name: remainingDynamic[i + 1].name,
            });
            usedPlayers.add(remainingDynamic[i].id);
            usedPlayers.add(remainingDynamic[i + 1].id);
          }

          // Handle odd player with bye - give bye to the lowest scoring player who hasn't been used
          if (standings.length % 2 === 1) {
            const unusedPlayer = shuffledStandings.find(
              (p) => !usedPlayers.has(p.id)
            );
            if (unusedPlayer) {
              console.log(`Giving bye to ${unusedPlayer.name}`);
              pairings.push({
                player1_id: unusedPlayer.id,
                player1_name: unusedPlayer.name,
                player2_id: null,
                player2_name: "BYE",
              });
            } else {
              console.log("ERROR: No unused player found for bye!");
            }
          }

          console.log("=== FINAL FIRST ROUND PAIRINGS ===");
          pairings.forEach((p, i) => {
            if (p.player2_id) {
              console.log(`${i + 1}. ${p.player1_name} vs ${p.player2_name}`);
            } else {
              console.log(`${i + 1}. ${p.player1_name} gets BYE`);
            }
          });
          console.log("=== END FIRST ROUND PAIRING ===\n");
        } else {
          // For subsequent rounds, pair by points (Swiss system)
          console.log("=== STARTING SUBSEQUENT ROUNDS PAIRING ===");
          console.log(
            "Initial standings:",
            standings.map(
              (p) => `${p.name} (${p.points}pts, static:${p.static_seating})`
            )
          );

          const usedPlayers = new Set<number>();

          // Track bye history to avoid giving multiple byes to the same player
          const byeHistory = new Map<number, number>();
          existingMatches.forEach((match) => {
            if (match.result === "BYE") {
              const playerId = match.player1_id || match.player2_id;
              if (playerId) {
                byeHistory.set(playerId, (byeHistory.get(playerId) || 0) + 1);
              }
            }
          });
          console.log("Bye history:", Object.fromEntries(byeHistory));

          // Create a queue of available players
          let queue = standings.map((p) => ({ ...p }));
          console.log(
            "Initial queue:",
            queue.map((p) => p.name)
          );

          while (queue.length > 1) {
            const currentPlayer = queue.shift();
            console.log(
              `\n--- Processing player: ${currentPlayer?.name} (${currentPlayer?.id}) ---`
            );
            console.log(
              "Queue before processing:",
              queue.map((p) => p.name)
            );
            console.log("Used players:", Array.from(usedPlayers));

            if (!currentPlayer || usedPlayers.has(currentPlayer.id)) {
              console.log(
                `Skipping ${currentPlayer?.name} - already used or null`
              );
              continue;
            }

            // Find the best available opponent
            let bestOpponentIndex = -1;
            let bestScore = -Infinity;
            console.log(`Looking for opponent for ${currentPlayer.name}...`);

            for (let j = 0; j < queue.length; j++) {
              const opponent = queue[j];
              console.log(
                `  Checking opponent ${opponent.name} (${opponent.id})`
              );

              if (usedPlayers.has(opponent.id)) {
                console.log(`    Skipping ${opponent.name} - already used`);
                continue;
              }

              // Check if they've already played
              const alreadyPlayed = existingMatches.some(
                (match) =>
                  (match.player1_id === currentPlayer.id &&
                    match.player2_id === opponent.id) ||
                  (match.player1_id === opponent.id &&
                    match.player2_id === currentPlayer.id)
              );
              if (alreadyPlayed) {
                console.log(`    Skipping ${opponent.name} - already played`);
                continue;
              }

              // Check static seating constraint
              if (currentPlayer.static_seating && opponent.static_seating) {
                console.log(
                  `    Skipping ${opponent.name} - both static seating`
                );
                continue;
              }

              // Score based on point difference (closer is better)
              const score = -Math.abs(currentPlayer.points - opponent.points);
              console.log(
                `    ${opponent.name} score: ${score} (current best: ${bestScore})`
              );
              if (score > bestScore) {
                bestScore = score;
                bestOpponentIndex = j;
                console.log(`    New best opponent: ${opponent.name}`);
              }
            }

            if (bestOpponentIndex !== -1) {
              const bestOpponent = queue.splice(bestOpponentIndex, 1)[0];
              console.log(
                `✓ PAIRING: ${currentPlayer.name} vs ${bestOpponent.name}`
              );
              pairings.push({
                player1_id: currentPlayer.id,
                player1_name: currentPlayer.name,
                player2_id: bestOpponent.id,
                player2_name: bestOpponent.name,
              });
              usedPlayers.add(currentPlayer.id);
              usedPlayers.add(bestOpponent.id);
              console.log(
                "Queue after pairing:",
                queue.map((p) => p.name)
              );
            } else {
              // No suitable opponent found, consider bye
              const currentPlayerByes = byeHistory.get(currentPlayer.id) || 0;
              console.log(
                `No suitable opponent found for ${currentPlayer.name}. Current byes: ${currentPlayerByes}`
              );

              if (currentPlayerByes < 2) {
                console.log(`✓ GIVING BYE to ${currentPlayer.name}`);
                pairings.push({
                  player1_id: currentPlayer.id,
                  player1_name: currentPlayer.name,
                  player2_id: null,
                  player2_name: "BYE",
                });
                usedPlayers.add(currentPlayer.id);
              } else {
                // Can't get a bye, put back at end of queue
                console.log(
                  `✗ Can't give bye to ${currentPlayer.name} (already had ${currentPlayerByes}), putting back in queue`
                );
                queue.push(currentPlayer);
              }
              console.log(
                "Queue after bye decision:",
                queue.map((p) => p.name)
              );
            }
          }

          // Handle last unpaired player (if odd number)
          if (queue.length === 1) {
            const lastPlayer = queue[0];
            console.log(`\n--- Handling last player: ${lastPlayer.name} ---`);
            if (!usedPlayers.has(lastPlayer.id)) {
              const playerByes = byeHistory.get(lastPlayer.id) || 0;
              console.log(
                `Last player ${lastPlayer.name} has ${playerByes} byes`
              );
              if (playerByes < 2) {
                console.log(`✓ GIVING BYE to last player ${lastPlayer.name}`);
                pairings.push({
                  player1_id: lastPlayer.id,
                  player1_name: lastPlayer.name,
                  player2_id: null,
                  player2_name: "BYE",
                });
                usedPlayers.add(lastPlayer.id);
              } else {
                console.log(
                  `✗ Can't give bye to last player ${lastPlayer.name} (already had ${playerByes})`
                );
              }
            } else {
              console.log(`Last player ${lastPlayer.name} already used`);
            }
          }

          console.log("\n=== FINAL PAIRINGS ===");
          pairings.forEach((p, i) => {
            if (p.player2_id) {
              console.log(`${i + 1}. ${p.player1_name} vs ${p.player2_name}`);
            } else {
              console.log(`${i + 1}. ${p.player1_name} gets BYE`);
            }
          });
          console.log("=== END PAIRING ===\n");
        }

        // Create matches for all pairings
        const createdMatches = [];
        for (const pairing of pairings) {
          const matchId = await this.createMatch({
            tournament_id: tournamentId,
            round_number: roundNumber,
            player1_id: pairing.player1_id,
            player2_id: pairing.player2_id,
            result: undefined, // Don't set results immediately - wait for round to start
          });

          createdMatches.push({
            id: matchId,
            ...pairing,
          });
        }

        resolve(createdMatches);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getLeaderboardWithTiebreakers(tournamentId: number): Promise<any[]> {
    return new Promise(async (resolve, reject) => {
      try {
        // First, get basic player stats
        const basicStats = await new Promise<any[]>(
          (resolveStats, rejectStats) => {
            const sql = `
            SELECT 
              p.id,
              p.name,
              p.static_seating,
              tp.dropped,
              tp.started_round,
              COALESCE(SUM(
                CASE 
                  WHEN m.player1_id = p.id AND m.result = 'WIN_P1' THEN 1
                  WHEN m.player2_id = p.id AND m.result = 'WIN_P2' THEN 1
                  WHEN m.player1_id = p.id AND m.result = 'DRAW' THEN 0.5
                  WHEN m.player2_id = p.id AND m.result = 'DRAW' THEN 0.5
                  WHEN m.player1_id = p.id AND m.result = 'BYE' THEN 1
                  WHEN m.player2_id = p.id AND m.result = 'BYE' THEN 1
                  ELSE 0
                END
              ), 0) as points,
              SUM(CASE WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 1
                     WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 1
                     WHEN m.result = 'BYE' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
                     ELSE 0 END) as wins,
              SUM(CASE WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
                       ELSE 0 END) as draws,
              SUM(CASE WHEN m.result = 'WIN_P1' AND m.player2_id = p.id THEN 1
                       WHEN m.result = 'WIN_P2' AND m.player1_id = p.id THEN 1
                       ELSE 0 END) as losses,
              COUNT(CASE WHEN m.result IS NOT NULL THEN m.id END) as matches_played
            FROM players p
            INNER JOIN tournament_players tp ON p.id = tp.player_id
            LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) 
              AND m.tournament_id = tp.tournament_id
            WHERE tp.tournament_id = ? AND tp.dropped = FALSE
            GROUP BY p.id, p.name, p.static_seating, tp.dropped, tp.started_round
          `;

            this.db.all(sql, [tournamentId], (err, rows) => {
              if (err) {
                rejectStats(err);
              } else {
                resolveStats(rows);
              }
            });
          }
        );

        // Calculate opponent resistance for each player
        const playersWithResistance = await Promise.all(
          basicStats.map(async (player) => {
            const opponents = await new Promise<any[]>(
              (resolveOpponents, rejectOpponents) => {
                const sql = `
                SELECT DISTINCT 
                  CASE 
                    WHEN m.player1_id = ? THEN m.player2_id
                    WHEN m.player2_id = ? THEN m.player1_id
                  END as opponent_id
                FROM matches m
                WHERE m.tournament_id = ? 
                  AND (m.player1_id = ? OR m.player2_id = ?)
                  AND m.result IS NOT NULL
                  AND m.result != 'BYE'
              `;

                this.db.all(
                  sql,
                  [player.id, player.id, tournamentId, player.id, player.id],
                  (err, rows) => {
                    if (err) {
                      rejectOpponents(err);
                    } else {
                      resolveOpponents(rows);
                    }
                  }
                );
              }
            );

            // Calculate opponent resistance
            let opponentResistance = 0;
            if (opponents.length > 0) {
              const opponentStats = await Promise.all(
                opponents.map(async (opponent) => {
                  const stats = await new Promise<any>(
                    (resolveStats, rejectStats) => {
                      const sql = `
                      SELECT 
                        COALESCE(SUM(
                          CASE 
                            WHEN m.player1_id = ? AND m.result = 'WIN_P1' THEN 1
                            WHEN m.player2_id = ? AND m.result = 'WIN_P2' THEN 1
                            WHEN m.player1_id = ? AND m.result = 'DRAW' THEN 0.5
                            WHEN m.player2_id = ? AND m.result = 'DRAW' THEN 0.5
                            WHEN m.player1_id = ? AND m.result = 'BYE' THEN 1
                            WHEN m.player2_id = ? AND m.result = 'BYE' THEN 1
                            ELSE 0
                          END
                        ), 0) as points,
                        COUNT(m.id) as matches_played
                      FROM matches m
                      WHERE m.tournament_id = ? 
                        AND (m.player1_id = ? OR m.player2_id = ?)
                        AND m.result IS NOT NULL
                        AND m.result != 'BYE'
                    `;

                      this.db.get(
                        sql,
                        [
                          opponent.opponent_id,
                          opponent.opponent_id,
                          opponent.opponent_id,
                          opponent.opponent_id,
                          opponent.opponent_id,
                          opponent.opponent_id,
                          tournamentId,
                          opponent.opponent_id,
                          opponent.opponent_id,
                        ],
                        (err, row) => {
                          if (err) {
                            rejectStats(err);
                          } else {
                            resolveStats(row);
                          }
                        }
                      );
                    }
                  );

                  const resistance =
                    stats.matches_played > 0
                      ? Math.max(0.25, stats.points / stats.matches_played)
                      : 0.25;

                  return resistance;
                })
              );

              opponentResistance =
                opponentStats.reduce((sum, resistance) => sum + resistance, 0) /
                opponentStats.length;
            }

            // Calculate opponent's opponent's resistance
            let opponentOpponentResistance = 0;
            if (opponents.length > 0) {
              const opponentOpponentResistances = await Promise.all(
                opponents.map(async (opponent) => {
                  // Get the opponents of this opponent
                  const opponentOpponents = await new Promise<any[]>(
                    (resolveOpponentOpponents, rejectOpponentOpponents) => {
                      const sql = `
                      SELECT DISTINCT 
                        CASE 
                          WHEN m.player1_id = ? THEN m.player2_id
                          WHEN m.player2_id = ? THEN m.player1_id
                        END as opponent_opponent_id
                      FROM matches m
                      WHERE m.tournament_id = ? 
                        AND (m.player1_id = ? OR m.player2_id = ?)
                        AND m.result IS NOT NULL
                        AND m.result != 'BYE'
                        AND (m.player1_id != ? AND m.player2_id != ?)
                    `;

                      this.db.all(
                        sql,
                        [
                          opponent.opponent_id,
                          opponent.opponent_id,
                          tournamentId,
                          opponent.opponent_id,
                          opponent.opponent_id,
                          player.id,
                          player.id,
                        ],
                        (err, rows) => {
                          if (err) {
                            rejectOpponentOpponents(err);
                          } else {
                            resolveOpponentOpponents(rows);
                          }
                        }
                      );
                    }
                  );

                  // Calculate resistance for each opponent's opponent
                  if (opponentOpponents.length > 0) {
                    const opponentOpponentStats = await Promise.all(
                      opponentOpponents.map(async (opponentOpponent) => {
                        const stats = await new Promise<any>(
                          (resolveStats, rejectStats) => {
                            const sql = `
                            SELECT 
                              COALESCE(SUM(
                                CASE 
                                  WHEN m.player1_id = ? AND m.result = 'WIN_P1' THEN 1
                                  WHEN m.player2_id = ? AND m.result = 'WIN_P2' THEN 1
                                  WHEN m.player1_id = ? AND m.result = 'DRAW' THEN 0.5
                                  WHEN m.player2_id = ? AND m.result = 'DRAW' THEN 0.5
                                  WHEN m.player1_id = ? AND m.result = 'BYE' THEN 1
                                  WHEN m.player2_id = ? AND m.result = 'BYE' THEN 1
                                  ELSE 0
                                END
                              ), 0) as points,
                              COUNT(m.id) as matches_played
                            FROM matches m
                            WHERE m.tournament_id = ? 
                              AND (m.player1_id = ? OR m.player2_id = ?)
                              AND m.result IS NOT NULL
                              AND m.result != 'BYE'
                          `;

                            this.db.get(
                              sql,
                              [
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                                tournamentId,
                                opponentOpponent.opponent_opponent_id,
                                opponentOpponent.opponent_opponent_id,
                              ],
                              (err, row) => {
                                if (err) {
                                  rejectStats(err);
                                } else {
                                  resolveStats(row);
                                }
                              }
                            );
                          }
                        );

                        const resistance =
                          stats.matches_played > 0
                            ? Math.max(
                                0.25,
                                stats.points / stats.matches_played
                              )
                            : 0.25;

                        return resistance;
                      })
                    );

                    const avgResistance =
                      opponentOpponentStats.reduce(
                        (sum, resistance) => sum + resistance,
                        0
                      ) / opponentOpponentStats.length;
                    return avgResistance;
                  } else {
                    return 0.25; // Default minimum resistance
                  }
                })
              );

              opponentOpponentResistance =
                opponentOpponentResistances.reduce(
                  (sum, resistance) => sum + resistance,
                  0
                ) / opponentOpponentResistances.length;
            }

            return {
              ...player,
              opponent_resistance: opponentResistance,
              opponent_opponent_resistance: opponentOpponentResistance,
            };
          })
        );

        // Sort by points, then opponent resistance, then opponent's opponent's resistance, then name
        playersWithResistance.sort((a, b) => {
          if (a.points !== b.points) return b.points - a.points;
          if (a.opponent_resistance !== b.opponent_resistance)
            return b.opponent_resistance - a.opponent_resistance;
          if (a.opponent_opponent_resistance !== b.opponent_opponent_resistance)
            return (
              b.opponent_opponent_resistance - a.opponent_opponent_resistance
            );
          return a.name.localeCompare(b.name);
        });

        resolve(playersWithResistance);
      } catch (error) {
        reject(error);
      }
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

  async updateRoundStatus(
    tournamentId: number,
    roundNumber: number,
    status: "pending" | "started" | "completed"
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = `
          UPDATE matches 
          SET round_status = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE tournament_id = ? AND round_number = ?
        `;

        this.db.run(sql, [status, tournamentId, roundNumber], async (err) => {
          if (err) {
            reject(err);
          } else {
            // If starting the round, automatically set bye results
            if (status === "started") {
              await this.setByeResultsForRound(tournamentId, roundNumber);
            }
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async setByeResultsForRound(
    tournamentId: number,
    roundNumber: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE matches 
        SET result = 'BYE', winner_id = player1_id, updated_at = CURRENT_TIMESTAMP 
        WHERE tournament_id = ? AND round_number = ? AND player2_id IS NULL AND result IS NULL
      `;

      this.db.run(sql, [tournamentId, roundNumber], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getRoundStatus(
    tournamentId: number,
    roundNumber: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT round_status 
        FROM matches 
        WHERE tournament_id = ? AND round_number = ? 
        LIMIT 1
      `;

      this.db.get(sql, [tournamentId, roundNumber], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.round_status : "pending");
        }
      });
    });
  }

  async deleteMatch(matchId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM matches WHERE id = ?`;

      this.db.run(sql, [matchId], function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async updateMatch(
    matchId: number,
    player1Id?: number,
    player2Id?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE matches 
        SET player1_id = ?, player2_id = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;

      this.db.run(
        sql,
        [player1Id || null, player2Id || null, matchId],
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
