import { PostgresDatabase } from "./database/postgres-database";

const migrateDatabase = async () => {
  const db = new PostgresDatabase();

  try {
    // Add round_status column to matches table if it doesn't exist
    const addRoundStatusColumn = `
      ALTER TABLE matches 
      ADD COLUMN round_status TEXT DEFAULT 'pending' 
      CHECK(round_status IN ('pending', 'started', 'completed'))
    `;

    try {
      await db.runRawQuery(addRoundStatusColumn);
    } catch (error: any) {
      if (error.message.includes("duplicate column name")) {
        // console.log("ℹ️  round_status column already exists");
      } else {
        console.error("❌ Error adding round_status column:", error.message);
      }
    }

    // Add owner_id columns to existing tables
    const addOwnerIdToLeagues = `
      ALTER TABLE leagues 
      ADD COLUMN owner_id INTEGER DEFAULT 1
    `;

    const addOwnerIdToTournaments = `
      ALTER TABLE tournaments 
      ADD COLUMN owner_id INTEGER DEFAULT 1
    `;

    const addOwnerIdToPlayers = `
      ALTER TABLE players 
      ADD COLUMN owner_id INTEGER DEFAULT 1
    `;

    try {
      await db.runRawQuery(addOwnerIdToLeagues);
      console.log("✅ Added owner_id to leagues table");
    } catch (error: any) {
      if (error.message.includes("duplicate column name")) {
        console.log("ℹ️  owner_id column already exists in leagues");
      } else {
        console.error("❌ Error adding owner_id to leagues:", error.message);
      }
    }

    try {
      await db.runRawQuery(addOwnerIdToTournaments);
      console.log("✅ Added owner_id to tournaments table");
    } catch (error: any) {
      if (error.message.includes("duplicate column name")) {
        console.log("ℹ️  owner_id column already exists in tournaments");
      } else {
        console.error(
          "❌ Error adding owner_id to tournaments:",
          error.message
        );
      }
    }

    try {
      await db.runRawQuery(addOwnerIdToPlayers);
      console.log("✅ Added owner_id to players table");
    } catch (error: any) {
      if (error.message.includes("duplicate column name")) {
        console.log("ℹ️  owner_id column already exists in players");
      } else {
        console.error("❌ Error adding owner_id to players:", error.message);
      }
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    db.close();
  }
};

migrateDatabase();
