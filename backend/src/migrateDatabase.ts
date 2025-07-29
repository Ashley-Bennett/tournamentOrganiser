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

    // Add status column to tournaments table if it doesn't exist
    console.log("Adding status column to tournaments table...");
    const checkStatusColumnSql = `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('tournaments') 
      WHERE name = 'status'
    `;
    const statusColumnExists = await db
      .getRawQuery(checkStatusColumnSql, [])
      .then((row: any) => row.count > 0);
    if (!statusColumnExists) {
      console.log("Adding status column...");
      const addStatusColumnSql = `
        ALTER TABLE tournaments 
        ADD COLUMN status TEXT NOT NULL DEFAULT 'new' 
        CHECK(status IN ('new', 'active', 'completed'))
      `;
      await db.runRawQuery(addStatusColumnSql, []);
      console.log("✅ status column added successfully");
    } else {
      console.log("✅ status column already exists");
    }

    // Migrate existing tournaments to set status based on is_completed and matches
    console.log("Migrating existing tournaments to set status...");
    // Set completed tournaments
    await db.runRawQuery(
      `UPDATE tournaments SET status = 'completed' WHERE is_completed = 1`,
      []
    );
    // Set active tournaments (has matches, not completed)
    await db.runRawQuery(
      `UPDATE tournaments SET status = 'active' WHERE id IN (SELECT DISTINCT tournament_id FROM matches) AND is_completed = 0`,
      []
    );
    // Set new tournaments (no matches, not completed)
    await db.runRawQuery(
      `UPDATE tournaments SET status = 'new' WHERE status IS NULL OR status = ''`,
      []
    );
    console.log("✅ Existing tournaments migrated to new status field");

    // Update existing tournaments to have SWISS bracket type
    console.log("Updating existing tournaments to SWISS bracket type...");
    const updateSql = `
      UPDATE tournaments 
      SET bracket_type = 'SWISS' 
      WHERE bracket_type IS NULL OR bracket_type = ''
    `;

    await db.runRawQuery(updateSql, []);

    console.log("✅ Existing tournaments updated to SWISS bracket type");

    // Add trainer_id column to players table if it doesn't exist
    console.log("Checking for trainer_id column in players table...");
    const checkTrainerIdColumnSql = `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('players') 
      WHERE name = 'trainer_id'
    `;
    const trainerIdColumnExists = await db
      .getRawQuery(checkTrainerIdColumnSql, [])
      .then((row: any) => row.count > 0);
    if (!trainerIdColumnExists) {
      console.log("Adding trainer_id column...");
      await db.runRawQuery(
        `ALTER TABLE players ADD COLUMN trainer_id TEXT`,
        []
      );
      console.log("✅ trainer_id column added successfully");
    } else {
      console.log("✅ trainer_id column already exists");
    }

    // Add birth_year column to players table if it doesn't exist
    console.log("Checking for birth_year column in players table...");
    const checkBirthYearColumnSql = `
      SELECT COUNT(*) as count 
      FROM pragma_table_info('players') 
      WHERE name = 'birth_year'
    `;
    const birthYearColumnExists = await db
      .getRawQuery(checkBirthYearColumnSql, [])
      .then((row: any) => row.count > 0);
    if (!birthYearColumnExists) {
      console.log("Adding birth_year column...");
      await db.runRawQuery(
        `ALTER TABLE players ADD COLUMN birth_year INTEGER`,
        []
      );
      console.log("✅ birth_year column added successfully");
    } else {
      console.log("✅ birth_year column already exists");
    }

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
