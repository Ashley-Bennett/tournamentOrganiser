import { PostgresDatabase } from "./database/postgres-database";

const resetDatabase = async () => {
  const db = new PostgresDatabase();

  try {
    console.log("🗑️  Resetting PostgreSQL database...");

    // Truncate all tables in the correct order (respecting foreign key constraints)
    const tables = [
      "matches",
      "tournament_players",
      "players",
      "tournaments",
      "leagues",
      "users",
    ];

    for (const table of tables) {
      try {
        await db.runRawQuery(
          `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`
        );
        console.log(`✅ Truncated ${table} table`);
      } catch (error: any) {
        console.log(`ℹ️  Could not truncate ${table} table: ${error.message}`);
      }
    }

    console.log("✅ PostgreSQL database reset completed successfully!");
    console.log(
      "💡 You can now run the seed script to populate with sample data"
    );
  } catch (error) {
    console.error("❌ Error resetting database:", error);
  } finally {
    await db.close();
  }
};

// Run the reset function if this file is executed directly
if (require.main === module) {
  resetDatabase();
}

export default resetDatabase;
