import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StandingsTable from "./StandingsTable";
import type { PlayerWithTieBreakers } from "../utils/tieBreaking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(
  overrides: Partial<PlayerWithTieBreakers> & { id: string; name: string },
): PlayerWithTieBreakers {
  return {
    matchPoints: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchesPlayed: 0,
    opponents: [],
    byesReceived: 0,
    opponentMatchWinPercentage: 0,
    opponentOpponentMatchWinPercentage: 0,
    gameWinPercentage: 0,
    ...overrides,
  };
}

const NO_DROPS = new Map<string, number | null>();

// ---------------------------------------------------------------------------
// Rendering players
// ---------------------------------------------------------------------------

describe("StandingsTable — rendering", () => {
  it("renders all player names", () => {
    const standings = [
      makePlayer({ id: "1", name: "Alice", wins: 2, matchPoints: 6 }),
      makePlayer({ id: "2", name: "Bob", wins: 1, losses: 1, matchPoints: 3 }),
      makePlayer({ id: "3", name: "Carol", losses: 2 }),
    ];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("renders the correct W-L-D record for each player", () => {
    const standings = [
      makePlayer({ id: "1", name: "Alice", wins: 3, losses: 0, draws: 0, matchPoints: 9 }),
      makePlayer({ id: "2", name: "Bob", wins: 1, losses: 1, draws: 1, matchPoints: 4 }),
    ];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("3-0-0")).toBeInTheDocument();
    expect(screen.getByText("1-1-1")).toBeInTheDocument();
  });

  it("renders match points for each player", () => {
    const standings = [
      makePlayer({ id: "1", name: "Alice", wins: 3, matchPoints: 9 }),
      makePlayer({ id: "2", name: "Bob", matchPoints: 0 }),
    ];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders OMW% and OOMW% columns", () => {
    render(
      <StandingsTable standings={[makePlayer({ id: "1", name: "Alice" })]} droppedMap={NO_DROPS} />,
    );

    expect(screen.getByText("OMW%")).toBeInTheDocument();
    expect(screen.getByText("OOMW%")).toBeInTheDocument();
  });

  it("formats OMW% as a percentage with one decimal place", () => {
    const standings = [
      makePlayer({
        id: "1",
        name: "Alice",
        wins: 1,
        matchPoints: 3,
        opponentMatchWinPercentage: 0.6667,
      }),
    ];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("66.7%")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rank display
// ---------------------------------------------------------------------------

describe("StandingsTable — rank display", () => {
  it("shows rank numbers for players outside the top 3", () => {
    const standings = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ id: `${i + 1}`, name: `Player ${i + 1}` }),
    );

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows Rank column header", () => {
    render(
      <StandingsTable standings={[makePlayer({ id: "1", name: "Alice" })]} droppedMap={NO_DROPS} />,
    );
    expect(screen.getByText("Rank")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dropped players
// ---------------------------------------------------------------------------

describe("StandingsTable — dropped players", () => {
  it("shows 'Dropped' chip for a player dropped without a round number", () => {
    const standings = [
      makePlayer({ id: "1", name: "Alice", wins: 1, matchPoints: 3 }),
      makePlayer({ id: "2", name: "Bob" }),
    ];
    const dropped = new Map<string, number | null>([["2", null]]);

    render(<StandingsTable standings={standings} droppedMap={dropped} />);

    expect(screen.getByText("Dropped")).toBeInTheDocument();
  });

  it("shows 'Dropped Rd N' chip when a round number is known", () => {
    const standings = [makePlayer({ id: "1", name: "Alice" })];
    const dropped = new Map<string, number | null>([["1", 3]]);

    render(<StandingsTable standings={standings} droppedMap={dropped} />);

    expect(screen.getByText("Dropped Rd 3")).toBeInTheDocument();
  });

  it("does not show dropped chip for active players", () => {
    const standings = [makePlayer({ id: "1", name: "Alice" })];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.queryByText(/Dropped/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty / edge cases
// ---------------------------------------------------------------------------

describe("StandingsTable — edge cases", () => {
  it("renders without crashing when standings is empty", () => {
    render(<StandingsTable standings={[]} droppedMap={NO_DROPS} />);
    // Column headers still render
    expect(screen.getByText("Rank")).toBeInTheDocument();
  });

  it("renders a single player correctly", () => {
    const standings = [makePlayer({ id: "1", name: "Solo" })];

    render(<StandingsTable standings={standings} droppedMap={NO_DROPS} />);

    expect(screen.getByText("Solo")).toBeInTheDocument();
    expect(screen.getByText("0-0-0")).toBeInTheDocument();
  });
});
