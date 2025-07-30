const { Pool } = require("pg");

// Test configuration - update these values to match your database
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://localhost:5432/tournament_organiser",
});

async function testPairingAlgorithm() {
  const client = await pool.connect();
  try {
    console.log("🧪 Testing Swiss Pairing Algorithm with Floating Down");
    console.log("==================================================");

    // Get tournament data
    const tournamentId = 1; // Update this to your tournament ID
    const roundNumber = 2; // Update this to the round you're testing

    console.log(`📊 Testing tournament ${tournamentId}, round ${roundNumber}`);

    // Get player standings
    const standingsResult = await client.query(
      `
      SELECT 
        p.id, 
        p.name,
        p.static_seating,
        COALESCE(SUM(
          CASE 
            WHEN m.result = 'WIN_P1' AND m.player1_id = p.id THEN 3
            WHEN m.result = 'WIN_P2' AND m.player2_id = p.id THEN 3
            WHEN m.result = 'DRAW' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 1
            WHEN m.result = 'BYE' AND (m.player1_id = p.id OR m.player2_id = p.id) THEN 2
            ELSE 0
          END
        ), 0) as points,
        COUNT(m.id) as matches_played
      FROM players p
      INNER JOIN tournament_players tp ON p.id = tp.player_id
      LEFT JOIN matches m ON (m.player1_id = p.id OR m.player2_id = p.id) 
        AND m.tournament_id = $1 
        AND m.round_number < $2
      WHERE tp.tournament_id = $1 
        AND tp.dropped = false
        AND tp.started_round <= $2
        AND p.id NOT IN (
          SELECT player1_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player1_id IS NOT NULL
          UNION
          SELECT player2_id FROM matches WHERE tournament_id = $1 AND round_number = $2 AND player2_id IS NOT NULL
        )
      GROUP BY p.id, p.name, p.static_seating
      ORDER BY points DESC, p.name ASC
    `,
      [tournamentId, roundNumber]
    );

    const players = standingsResult.rows;
    console.log(`\n👥 Players available for pairing:`);
    players.forEach((player, index) => {
      console.log(
        `  ${index + 1}. ${player.name} (ID: ${player.id}) - ${
          player.points
        } points, Static: ${player.static_seating}`
      );
    });

    // Group players by points
    const scoreBrackets = new Map();
    for (const player of players) {
      const points = player.points;
      if (!scoreBrackets.has(points)) {
        scoreBrackets.set(points, []);
      }
      scoreBrackets.get(points).push(player);
    }

    console.log(`\n🏆 Score brackets:`);
    const sortedBrackets = Array.from(scoreBrackets.entries()).sort(
      ([a], [b]) => b - a
    );
    sortedBrackets.forEach(([points, bracketPlayers]) => {
      console.log(`  ${points} points: ${bracketPlayers.length} players`);
      bracketPlayers.forEach((player) => {
        console.log(`    - ${player.name} (ID: ${player.id})`);
      });
    });

    // Check for potential issues
    console.log(`\n🔍 Potential Issues:`);

    // Check for odd numbers in brackets
    sortedBrackets.forEach(([points, bracketPlayers]) => {
      if (bracketPlayers.length % 2 === 1) {
        console.log(
          `  ⚠️  Odd number of players (${bracketPlayers.length}) in ${points}-point bracket`
        );
      }
    });

    // Check for static seating conflicts
    const staticSeatingPlayers = players.filter((p) => p.static_seating);
    if (staticSeatingPlayers.length > 1) {
      console.log(
        `  ⚠️  ${staticSeatingPlayers.length} static seating players found`
      );
      staticSeatingPlayers.forEach((player) => {
        console.log(`    - ${player.name} (ID: ${player.id})`);
      });
    }

    // Check for previous matches
    console.log(`\n📋 Previous matches in this tournament:`);
    const previousMatches = await client.query(
      `SELECT m.*, p1.name as player1_name, p2.name as player2_name
       FROM matches m 
       LEFT JOIN players p1 ON m.player1_id = p1.id 
       LEFT JOIN players p2 ON m.player2_id = p2.id 
       WHERE m.tournament_id = $1 AND m.round_number < $2
       ORDER BY m.round_number, m.id`,
      [tournamentId, roundNumber]
    );

    previousMatches.rows.forEach((match) => {
      if (match.player1_id && match.player2_id) {
        console.log(
          `  Round ${match.round_number}: ${match.player1_name} vs ${match.player2_name}`
        );
      } else if (match.player1_id) {
        console.log(
          `  Round ${match.round_number}: ${match.player1_name} (BYE)`
        );
      }
    });

    console.log(
      `\n✅ Test completed. Check the logs above for potential issues.`
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the test
testPairingAlgorithm().catch(console.error);
