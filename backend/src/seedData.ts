import { Database } from "./database/database";

const seedData = async () => {
  const db = new Database();

  try {
    console.log("🌱 Starting to seed database...");

    // Create sample users (TOs)
    console.log("Creating sample users...");
    const user1Id = await db.createUser({
      name: "John Smith",
      email: "john.smith@tournament.com",
      password: "password123",
    });
    const user2Id = await db.createUser({
      name: "Sarah Johnson",
      email: "sarah.johnson@tournament.com",
      password: "password123",
    });

    // Create sample leagues
    console.log("Creating sample leagues...");
    const league1Id = await db.createLeague({
      name: "Spring Championship Series",
      description: "Annual spring tournament series for competitive players",
    });
    const league2Id = await db.createLeague({
      name: "Weekend Warriors",
      description: "Casual weekend tournaments for all skill levels",
    });
    const league3Id = await db.createLeague({
      name: "Pro Circuit",
      description: "Professional tournament circuit with high stakes",
    });

    // Create sample players
    console.log("Creating sample players...");
    const player1Id = await db.createPlayer({
      name: "Mike Chen",
      static_seating: true,
    });
    const player2Id = await db.createPlayer({
      name: "Emma Rodriguez",
      static_seating: false,
    });
    const player3Id = await db.createPlayer({
      name: "David Kim",
      static_seating: true,
    });
    const player4Id = await db.createPlayer({
      name: "Lisa Wang",
      static_seating: false,
    });
    const player5Id = await db.createPlayer({
      name: "Alex Thompson",
      static_seating: true,
    });
    const player6Id = await db.createPlayer({
      name: "Maria Garcia",
      static_seating: false,
    });
    const player7Id = await db.createPlayer({
      name: "James Wilson",
      static_seating: true,
    });
    const player8Id = await db.createPlayer({
      name: "Sophie Brown",
      static_seating: false,
    });

    // Create sample tournaments
    console.log("Creating sample tournaments...");
    const tournament1Id = await db.createTournament({
      name: "Spring Championship 2024",
      date: "2024-03-15",
      league_id: league1Id,
      bracket_type: "SWISS",
    });
    const tournament2Id = await db.createTournament({
      name: "Weekend Warriors March Madness",
      date: "2024-03-23",
      league_id: league2Id,
      bracket_type: "SWISS",
    });
    const tournament3Id = await db.createTournament({
      name: "Pro Circuit Qualifier",
      date: "2024-04-10",
      league_id: league3Id,
      bracket_type: "SWISS",
    });
    const tournament4Id = await db.createTournament({
      name: "Casual Friday Night",
      date: "2024-03-29",
      bracket_type: "SWISS",
      // No league association
    });

    // Add players to tournaments
    console.log("Adding players to tournaments...");

    // Tournament 1 - 8 players
    await db.addPlayerToTournament({
      player_id: player1Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player2Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player3Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player4Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player5Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player6Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player7Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player8Id,
      tournament_id: tournament1Id,
      started_round: 1,
    });

    // Tournament 2 - 6 players
    await db.addPlayerToTournament({
      player_id: player1Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player2Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player3Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player4Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player5Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player6Id,
      tournament_id: tournament2Id,
      started_round: 1,
    });

    // Tournament 3 - 4 players
    await db.addPlayerToTournament({
      player_id: player1Id,
      tournament_id: tournament3Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player3Id,
      tournament_id: tournament3Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player5Id,
      tournament_id: tournament3Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player7Id,
      tournament_id: tournament3Id,
      started_round: 1,
    });

    // Tournament 4 - 4 players
    await db.addPlayerToTournament({
      player_id: player2Id,
      tournament_id: tournament4Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player4Id,
      tournament_id: tournament4Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player6Id,
      tournament_id: tournament4Id,
      started_round: 1,
    });
    await db.addPlayerToTournament({
      player_id: player8Id,
      tournament_id: tournament4Id,
      started_round: 1,
    });

    // Mark one player as dropped in tournament 2
    await db.updatePlayerDropStatus(tournament2Id, player6Id, true);

    // Create sample matches for tournament 1 (completed tournament)
    console.log("Creating sample matches...");

    // Round 1 matches
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 1,
      player1_id: player1Id,
      player2_id: player2Id,
      result: "WIN_P1",
    });
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 1,
      player1_id: player3Id,
      player2_id: player4Id,
      result: "WIN_P2",
    });
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 1,
      player1_id: player5Id,
      player2_id: player6Id,
      result: "WIN_P1",
    });
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 1,
      player1_id: player7Id,
      player2_id: player8Id,
      result: "DRAW",
    });

    // Round 2 matches
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 2,
      player1_id: player1Id,
      player2_id: player4Id,
      result: "WIN_P1",
    });
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 2,
      player1_id: player5Id,
      player2_id: player7Id,
      result: "WIN_P2",
    });

    // Final match
    await db.createMatch({
      tournament_id: tournament1Id,
      round_number: 3,
      player1_id: player1Id,
      player2_id: player7Id,
      result: "WIN_P1",
    });

    // Create some matches for tournament 2 (ongoing)
    await db.createMatch({
      tournament_id: tournament2Id,
      round_number: 1,
      player1_id: player1Id,
      player2_id: player2Id,
      result: "WIN_P1",
    });
    await db.createMatch({
      tournament_id: tournament2Id,
      round_number: 1,
      player1_id: player3Id,
      player2_id: player4Id,
      result: "WIN_P2",
    });
    await db.createMatch({
      tournament_id: tournament2Id,
      round_number: 1,
      player1_id: player5Id,
      player2_id: player6Id,
      result: "BYE",
    });

    // Mark tournament 1 as completed
    await db.updateTournamentCompletion(tournament1Id, true);

    console.log("✅ Database seeded successfully!");
    console.log("\n📊 Sample Data Summary:");
    console.log(`- Users (TOs): 2`);
    console.log(`- Leagues: 3`);
    console.log(`- Players: 8`);
    console.log(`- Tournaments: 4`);
    console.log(`- Tournament Players: 22 entries`);
    console.log(`- Matches: 9`);
    console.log(`- Completed Tournaments: 1`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
  } finally {
    db.close();
  }
};

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedData();
}

export default seedData;
