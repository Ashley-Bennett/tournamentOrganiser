import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePairingEditor } from "./usePairingEditor";
import type { MatchWithPlayers } from "../types/match";
import type { TournamentSummary } from "../types/tournament";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";

const TOURNAMENT: TournamentSummary = {
  id: "t1",
  name: "Test Cup",
  status: "active",
  tournament_type: "swiss",
  num_rounds: 3,
  created_at: "2024-01-01T00:00:00Z",
  created_by: "user-1",
};

function makeMatch(overrides: Partial<MatchWithPlayers> = {}): MatchWithPlayers {
  return {
    id: "m1",
    tournament_id: "t1",
    round_number: 1,
    match_number: 1,
    player1_id: "p1",
    player2_id: "p2",
    player1_name: "Alice",
    player2_name: "Bob",
    winner_id: null,
    winner_name: null,
    result: null,
    temp_winner_id: null,
    temp_result: null,
    pairings_published: false,
    status: "ready",
    confirmed_by: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultParams = {
  matches: [makeMatch()],
  selectedRound: 1 as number | "standings",
  tournament: TOURNAMENT,
  workspaceId: "ws1",
  refreshMatches: vi.fn().mockResolvedValue(undefined),
  setError: vi.fn(),
};

describe("usePairingEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with editingPairings false", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    expect(result.current.editingPairings).toBe(false);
  });

  it("handleEditPairings initialises editedPairings from current round matches", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    expect(result.current.editingPairings).toBe(true);
    expect(result.current.editedPairings.get("m1")).toEqual({
      player1Id: "p1",
      player2Id: "p2",
    });
  });

  it("handleCancelEditPairings resets state", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    act(() => result.current.handleCancelEditPairings());
    expect(result.current.editingPairings).toBe(false);
    expect(result.current.editedPairings.size).toBe(0);
  });

  it("availablePool is empty when not editing", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    expect(result.current.availablePool.size).toBe(0);
  });

  it("availablePool contains players removed from slots", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    act(() => result.current.removeFromSlot("m1", "player1"));
    expect(result.current.availablePool.get("p1")).toBe("Alice");
    expect(result.current.availablePool.has("p2")).toBe(false);
  });

  it("pairingEditsValid is false while pool is non-empty", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    act(() => result.current.removeFromSlot("m1", "player1"));
    expect(result.current.pairingEditsValid).toBe(false);
  });

  it("pairingEditsValid is true when pool is empty", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    expect(result.current.pairingEditsValid).toBe(true);
  });

  it("assignToSlot moves player from pool back to a slot", () => {
    const { result } = renderHook(() => usePairingEditor(defaultParams));
    act(() => result.current.handleEditPairings());
    act(() => result.current.removeFromSlot("m1", "player1"));
    act(() => result.current.assignToSlot("m1", "player1", "p1"));
    expect(result.current.availablePool.size).toBe(0);
    expect(result.current.editedPairings.get("m1")?.player1Id).toBe("p1");
  });

  it("roundPlayers lists all players in the selected round", () => {
    const matches = [
      makeMatch({ id: "m1", player1_id: "p1", player1_name: "Alice", player2_id: "p2", player2_name: "Bob" }),
      makeMatch({ id: "m2", player1_id: "p3", player1_name: "Carol", player2_id: "p4", player2_name: "Dave" }),
    ];
    const { result } = renderHook(() =>
      usePairingEditor({ ...defaultParams, matches }),
    );
    const ids = result.current.roundPlayers.map((p) => p.id).sort();
    expect(ids).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("roundPlayers excludes players from other rounds", () => {
    const matches = [
      // round 1: only p1 (bye match, no p2)
      makeMatch({ id: "m1", round_number: 1, player1_id: "p1", player1_name: "Alice", player2_id: null, player2_name: null }),
      // round 2: only p2
      makeMatch({ id: "m2", round_number: 2, player1_id: "p2", player1_name: "Bob", player2_id: null, player2_name: null }),
    ];
    const { result } = renderHook(() =>
      usePairingEditor({ ...defaultParams, matches, selectedRound: 1 }),
    );
    expect(result.current.roundPlayers.map((p) => p.id)).toEqual(["p1"]);
  });

  it("handleSavePairingEdits calls refreshMatches when no pairings changed", async () => {
    // Build a properly chainable mock that resolves at the end of each chain
    const makeChain = (): Record<string, unknown> => {
      const c: Record<string, unknown> = {};
      c.update = vi.fn().mockReturnValue(c);
      c.delete = vi.fn().mockReturnValue(c);
      c.in = vi.fn().mockResolvedValue({ error: null });
      c.insert = vi.fn().mockResolvedValue({ error: null });
      // eq chains and the last one resolves as a Promise
      c.eq = vi.fn().mockImplementation(() => {
        const sub: Record<string, unknown> = {};
        sub.eq = vi.fn().mockImplementation(() => {
          const sub2: Record<string, unknown> = {};
          sub2.eq = vi.fn().mockResolvedValue({ error: null });
          return sub2;
        });
        return sub;
      });
      return c;
    };
    vi.mocked(supabase.from).mockReturnValue(
      makeChain() as unknown as ReturnType<typeof supabase.from>,
    );

    const refreshMatches = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePairingEditor({ ...defaultParams, refreshMatches }),
    );
    act(() => result.current.handleEditPairings());
    // No slot changes — changedMatches will be empty, only update runs
    await act(async () => result.current.handleSavePairingEdits());
    expect(refreshMatches).toHaveBeenCalled();
  });
});
