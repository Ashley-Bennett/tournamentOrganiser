const fetch = require("node-fetch");

async function testTournamentCreation() {
  try {
    console.log("Testing tournament creation API...");

    const testData = {
      name: "Test Tournament",
      date: "2024-12-01",
      bracket_type: "SWISS",
    };

    console.log("Sending data:", testData);

    const response = await fetch("http://localhost:3002/api/tournaments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    console.log("Response status:", response.status);

    const result = await response.json();
    console.log("Response body:", result);

    if (response.ok) {
      console.log("✅ Tournament creation successful!");
    } else {
      console.log("❌ Tournament creation failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testTournamentCreation();
