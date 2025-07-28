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
    // Create tournaments table
    const createTournamentsTable = `
      CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT,
        end_date TEXT,
        max_participants INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create participants table
    const createParticipantsTable = `
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'registered',
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id)
      )
    `;

    // Create matches table
    const createMatchesTable = `
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER,
        participant1_id INTEGER,
        participant2_id INTEGER,
        round INTEGER,
        winner_id INTEGER,
        match_date TEXT,
        status TEXT DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id),
        FOREIGN KEY (participant1_id) REFERENCES participants (id),
        FOREIGN KEY (participant2_id) REFERENCES participants (id),
        FOREIGN KEY (winner_id) REFERENCES participants (id)
      )
    `;

    this.db.serialize(() => {
      this.db.run(createTournamentsTable, (err) => {
        if (err) {
          console.error("Error creating tournaments table:", err.message);
        } else {
          console.log("✅ Tournaments table created/verified");
        }
      });

      this.db.run(createParticipantsTable, (err) => {
        if (err) {
          console.error("Error creating participants table:", err.message);
        } else {
          console.log("✅ Participants table created/verified");
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

  // Tournament methods
  async createTournament(tournament: {
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    max_participants?: number;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO tournaments (name, description, start_date, end_date, max_participants)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          tournament.name,
          tournament.description || null,
          tournament.start_date || null,
          tournament.end_date || null,
          tournament.max_participants || null,
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
      const sql = "SELECT * FROM tournaments ORDER BY created_at DESC";

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
      const sql = "SELECT * FROM tournaments WHERE id = ?";

      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Participant methods
  async addParticipant(participant: {
    tournament_id: number;
    name: string;
    email?: string;
    phone?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO participants (tournament_id, name, email, phone)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          participant.tournament_id,
          participant.name,
          participant.email || null,
          participant.phone || null,
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

  async getParticipantsByTournament(tournamentId: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql =
        "SELECT * FROM participants WHERE tournament_id = ? ORDER BY registration_date";

      this.db.all(sql, [tournamentId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
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
}
