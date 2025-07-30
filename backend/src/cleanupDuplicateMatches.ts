import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function cleanupDuplicateMatches() {
  const client = await pool.connect();
  try {
    console.log("🔍 Checking for duplicate matches...");

    // Find all tournaments
    const tournamentsResult = await client.query(
      "SELECT id, name FROM tournaments"
    );
    const tournaments = tournamentsResult.rows;

    for (const tournament of tournaments) {
      console.log(
        `\n🏆 Checking tournament: ${tournament.name} (ID: ${tournament.id})`
      );

      // Find all matches for this tournament
      const matchesResult = await client.query(
        `SELECT id, player1_id, player2_id, round_number, result 
         FROM matches 
         WHERE tournament_id = $1 
         ORDER BY round_number, id`,
        [tournament.id]
      );

      const matches = matchesResult.rows;
      const duplicatePairs = new Map<string, any[]>();

      // Group matches by player pair (sorted to ensure consistent key)
      for (const match of matches) {
        if (!match.player1_id || !match.player2_id) continue;

        const player1 = Math.min(match.player1_id, match.player2_id);
        const player2 = Math.max(match.player1_id, match.player2_id);
        const pairKey = `${player1}-${player2}`;

        if (!duplicatePairs.has(pairKey)) {
          duplicatePairs.set(pairKey, []);
        }
        duplicatePairs.get(pairKey)!.push(match);
      }

      // Check for duplicates
      let totalDuplicates = 0;
      for (const [pairKey, pairMatches] of duplicatePairs) {
        if (pairMatches.length > 1) {
          const [player1Id, player2Id] = pairKey.split("-").map(Number);

          // Get player names for display
          const player1Result = await client.query(
            "SELECT name FROM players WHERE id = $1",
            [player1Id]
          );
          const player2Result = await client.query(
            "SELECT name FROM players WHERE id = $1",
            [player2Id]
          );
          const player1Name =
            player1Result.rows[0]?.name || `Player ${player1Id}`;
          const player2Name =
            player2Result.rows[0]?.name || `Player ${player2Id}`;

          console.log(
            `❌ Found ${pairMatches.length} matches between ${player1Name} and ${player2Name}:`
          );

          for (const match of pairMatches) {
            console.log(
              `   - Match ID: ${match.id}, Round: ${
                match.round_number
              }, Result: ${match.result || "pending"}`
            );
          }

          // Keep the first match, delete the rest
          const matchesToDelete = pairMatches.slice(1);
          for (const match of matchesToDelete) {
            console.log(`🗑️  Deleting duplicate match ID: ${match.id}`);
            await client.query("DELETE FROM matches WHERE id = $1", [match.id]);
            totalDuplicates++;
          }
        }
      }

      if (totalDuplicates > 0) {
        console.log(
          `✅ Cleaned up ${totalDuplicates} duplicate matches in tournament ${tournament.name}`
        );
      } else {
        console.log(
          `✅ No duplicate matches found in tournament ${tournament.name}`
        );
      }
    }

    console.log("\n🎉 Duplicate match cleanup completed!");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupDuplicateMatches().catch(console.error);
}

export { cleanupDuplicateMatches };
