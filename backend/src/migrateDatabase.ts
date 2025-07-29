import { Database } from "./database/database";

const migrateDatabase = async () => {
  const db = new Database();

  try {
    console.log("🔄 Starting database migration...");

    // Add round_status column to matches table if it doesn't exist
    const addRoundStatusColumn = `
      ALTER TABLE matches 
      ADD COLUMN round_status TEXT DEFAULT 'pending' 
      CHECK(round_status IN ('pending', 'started', 'completed'))
    `;

    try {
      await db.runRawQuery(addRoundStatusColumn);
      console.log("✅ Added round_status column to matches table");
    } catch (error: any) {
      if (error.message.includes("duplicate column name")) {
        console.log("ℹ️  round_status column already exists");
      } else {
        console.error("❌ Error adding round_status column:", error.message);
      }
    }

    console.log("✅ Database migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    db.close();
  }
};

migrateDatabase();
