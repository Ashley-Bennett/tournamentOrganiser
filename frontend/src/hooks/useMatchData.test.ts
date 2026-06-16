import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMatchData } from "./useMatchData";
import type { User } from "@supabase/supabase-js";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";

const MOCK_USER = { id: "user-1" } as User;

const MOCK_MATCH = {
  id: "m1",
  tournament_id: "t1",
  round_number: 1,
  match_number: 1,
  player1_id: "p1",
  player2_id: "p2",
  winner_id: null,
  result: null,
  temp_winner_id: null,
  temp_result: null,
  pairings_published: false,
  status: "pending",
  confirmed_by: null,
  pairing_decision_log: null,
  created_at: "2024-01-01T00:00:00Z",
};

const MOCK_PLAYER_NAMES = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

const MOCK_ALL_PLAYERS = [
  {
    id: "p1",
    name: "Alice",
    dropped: false,
    dropped_at_round: null,
    has_static_seating: false,
    static_seat_number: null,
    is_late_entry: false,
    late_entry_round: null,
    deck_pokemon1: null,
    deck_pokemon2: null,
  },
];

/** Create a chainable thenable that resolves with `response` when awaited. */
function makeChain(response: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "order"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain awaitable
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
    resolve(response);
    return Promise.resolve(response);
  });
  return chain;
}

const defaultParams = {
  tournamentId: "t1",
  user: MOCK_USER,
  setSelectedRound: vi.fn(),
  setError: vi.fn(),
};

describe("useMatchData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts with empty matches and players", () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>,
    );
    const { result } = renderHook(() => useMatchData(defaultParams));
    expect(result.current.matches).toEqual([]);
    expect(result.current.players).toEqual([]);
  });

  it("does not fetch when tournamentId is undefined", () => {
    renderHook(() => useMatchData({ ...defaultParams, tournamentId: undefined }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not fetch when user is null", () => {
    renderHook(() => useMatchData({ ...defaultParams, user: null }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("populates matches with player names on successful fetch", async () => {
    vi.mocked(supabase.from)
      .mockImplementationOnce(
        () => makeChain({ data: [MOCK_MATCH], error: null }) as unknown as ReturnType<typeof supabase.from>,
      )
      .mockImplementationOnce(
        () => makeChain({ data: MOCK_PLAYER_NAMES, error: null }) as unknown as ReturnType<typeof supabase.from>,
      )
      .mockImplementationOnce(
        () => makeChain({ data: MOCK_ALL_PLAYERS, error: null }) as unknown as ReturnType<typeof supabase.from>,
      );

    const { result } = renderHook(() => useMatchData(defaultParams));
    await waitFor(() => expect(result.current.matches.length).toBe(1));
    expect(result.current.matches[0].player1_name).toBe("Alice");
    expect(result.current.matches[0].player2_name).toBe("Bob");
  });

  it("calls setSelectedRound with highest round on first load", async () => {
    const setSelectedRound = vi.fn();
    const twoRoundMatches = [MOCK_MATCH, { ...MOCK_MATCH, id: "m2", round_number: 3 }];
    vi.mocked(supabase.from)
      .mockImplementationOnce(
        () => makeChain({ data: twoRoundMatches, error: null }) as unknown as ReturnType<typeof supabase.from>,
      )
      .mockImplementationOnce(
        () => makeChain({ data: MOCK_PLAYER_NAMES, error: null }) as unknown as ReturnType<typeof supabase.from>,
      )
      .mockImplementationOnce(
        () => makeChain({ data: MOCK_ALL_PLAYERS, error: null }) as unknown as ReturnType<typeof supabase.from>,
      );

    renderHook(() => useMatchData({ ...defaultParams, setSelectedRound }));
    await waitFor(() => expect(setSelectedRound).toHaveBeenCalledWith(3));
  });

  it("calls setError when the matches fetch fails", async () => {
    vi.mocked(supabase.from).mockImplementationOnce(
      () => makeChain({ data: null, error: { message: "DB error" } }) as unknown as ReturnType<typeof supabase.from>,
    );

    const setError = vi.fn();
    renderHook(() => useMatchData({ ...defaultParams, setError }));
    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith(expect.stringContaining("DB error")),
    );
  });
});
