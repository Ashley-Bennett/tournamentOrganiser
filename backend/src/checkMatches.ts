import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkMatches() {
  const client = await pool.connect();
  try {
    console.log("🔍 Checking current matches...");

    // Find all tournaments
    const tournamentsResult = await client.query(
      "SELECT id, name FROM tournaments"
    );
    const tournaments = tournamentsResult.rows;

    for (const tournament of tournaments) {
      console.log(`\n🏆 Tournament: ${tournament.name} (ID: ${tournament.id})`);

      // Find all matches for this tournament
      const matchesResult = await client.query(
        `SELECT m.id, m.player1_id, m.player2_id, m.round_number, m.result,
                p1.name as player1_name, p2.name as player2_name
         FROM matches m
         LEFT JOIN players p1 ON m.player1_id = p1.id
         LEFT JOIN players p2 ON m.player2_id = p2.id
         WHERE m.tournament_id = $1 
         ORDER BY m.round_number, m.id`,
        [tournament.id]
      );

      const matches = matchesResult.rows;

      if (matches.length === 0) {
        console.log("   No matches found");
        continue;
      }

      console.log(`   Found ${matches.length} matches:`);

      // Group by round
      const matchesByRound = new Map<number, any[]>();
      for (const match of matches) {
        const round = match.round_number;
        if (!matchesByRound.has(round)) {
          matchesByRound.set(round, []);
        }
        matchesByRound.get(round)!.push(match);
      }

      for (const [round, roundMatches] of matchesByRound) {
        console.log(`\n   Round ${round}:`);
        for (const match of roundMatches) {
          const player1Name =
            match.player1_name || `Player ${match.player1_id}`;
          const player2Name =
            match.player2_name || `Player ${match.player2_id}`;
          const result = match.result || "pending";
          console.log(
            `     Match ${match.id}: ${player1Name} vs ${player2Name} (${result})`
          );
        }
      }

      // Check for duplicate pairings
      const pairCounts = new Map<string, number>();
      for (const match of matches) {
        if (!match.player1_id || !match.player2_id) continue;

        const player1 = Math.min(match.player1_id, match.player2_id);
        const player2 = Math.max(match.player1_id, match.player2_id);
        const pairKey = `${player1}-${player2}`;

        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }

      const duplicates = Array.from(pairCounts.entries()).filter(
        ([_, count]) => count > 1
      );
      if (duplicates.length > 0) {
        console.log(`\n   ⚠️  Found ${duplicates.length} duplicate pairings:`);
        for (const [pairKey, count] of duplicates) {
          const [player1Id, player2Id] = pairKey.split("-").map(Number);
          const player1Name =
            matches.find(
              (m) => m.player1_id === player1Id || m.player2_id === player1Id
            )?.player1_name || `Player ${player1Id}`;
          const player2Name =
            matches.find(
              (m) => m.player1_id === player2Id || m.player2_id === player2Id
            )?.player2_name || `Player ${player2Id}`;
          console.log(
            `     ${player1Name} vs ${player2Name}: ${count} matches`
          );
        }
      } else {
        console.log(`\n   ✅ No duplicate pairings found`);
      }
    }
  } catch (error) {
    console.error("❌ Error checking matches:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the check if this script is executed directly
if (require.main === module) {
  checkMatches().catch(console.error);
}

export { checkMatches };
