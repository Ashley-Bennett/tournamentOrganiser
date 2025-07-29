import fs from "fs";
import path from "path";

const resetDatabase = () => {
  // Try multiple possible paths for the database file
  const possiblePaths = [
    path.join(__dirname, "../../data/tournament.db"),
    path.join(__dirname, "../data/tournament.db"),
    path.join(process.cwd(), "data/tournament.db"),
    path.join(process.cwd(), "src/data/tournament.db"),
  ];

  let deletedFile = false;

  for (const dbPath of possiblePaths) {
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        deletedFile = true;
      }
    } catch (error) {
      // console.log(`ℹ️  Could not access: ${dbPath}`);
    }
  }

  if (!deletedFile) {
    // console.log("ℹ️  No existing database file found in common locations");
  }

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    // console.log("📁 Created data directory");
  }

  // console.log("✅ Database reset completed successfully!");
  // console.log(
  //   "💡 You can now run the seed script to populate with sample data"
  // );
};

// Run the reset function if this file is executed directly
if (require.main === module) {
  resetDatabase();
}

export default resetDatabase;
