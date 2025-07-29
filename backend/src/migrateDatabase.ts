import { Database } from "./database/database";

const migrateDatabase = async () => {
  const db = new Database();

  try {
    console.log("🔄 Starting database migration...");

    // Add bracket_type column to tournaments table if it doesn't exist
    console.log("Adding bracket_type column to tournaments table...");

    // Check if bracket_type column exists
    const checkColumnSql = `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('tournaments') 
      WHERE name = 'bracket_type'
    `;

    const columnExists = await db
      .getRawQuery(checkColumnSql, [])
      .then((row: any) => row.count > 0);

    if (!columnExists) {
      console.log("Adding bracket_type column...");
      const addColumnSql = `
        ALTER TABLE tournaments 
        ADD COLUMN bracket_type TEXT NOT NULL DEFAULT 'SWISS' 
        CHECK(bracket_type IN ('SWISS', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'))
      `;

      await db.runRawQuery(addColumnSql, []);

      console.log("✅ bracket_type column added successfully");
    } else {
      console.log("✅ bracket_type column already exists");
    }

    // Update existing tournaments to have SWISS bracket type
    console.log("Updating existing tournaments to SWISS bracket type...");
    const updateSql = `
      UPDATE tournaments 
      SET bracket_type = 'SWISS' 
      WHERE bracket_type IS NULL OR bracket_type = ''
    `;

    await db.runRawQuery(updateSql, []);

    console.log("✅ Existing tournaments updated to SWISS bracket type");

    console.log("🎉 Database migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    db.close();
  }
};

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateDatabase();
}

export default migrateDatabase;
