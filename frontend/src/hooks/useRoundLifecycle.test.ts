import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRoundLifecycle } from "./useRoundLifecycle";
import type { User } from "@supabase/supabase-js";
import type { TournamentSummary } from "../types/tournament";
import type { MatchWithPlayers } from "../types/match";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";

function makeChain(response: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "eq", "update", "insert", "delete", "maybeSingle",
    "order", "in", "filter",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
    resolve(response);
    return Promise.resolve(response);
  });
  return chain;
}

const MOCK_USER = { id: "user-1" } as User;

const MOCK_TOURNAMENT: TournamentSummary = {
  id: "t1",
  name: "Test Tournament",
  status: "active",
  tournament_type: "swiss",
  num_rounds: 3,
  created_at: "2024-01-01T00:00:00Z",
  created_by: "user-1",
  is_public: false,
  public_slug: null,
  join_enabled: false,
  join_code: null,
  round_duration_minutes: null,
  current_round_started_at: null,
  round_elapsed_seconds: 0,
  round_is_paused: false,
  round_note: null,
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
    pairing_decision_log: null,
    ...overrides,
  };
}

const defaultParams = {
  tournament: MOCK_TOURNAMENT,
  setTournament: vi.fn(),
  matches: [makeMatch()],
  setMatches: vi.fn(),
  selectedRound: 1 as number | "standings",
  setSelectedRound: vi.fn(),
  workspaceId: "ws1",
  user: MOCK_USER,
  savePendingResults: vi.fn().mockResolvedValue(undefined),
  refreshMatches: vi.fn().mockResolvedValue(undefined),
  setError: vi.fn(),
  setSavingTimer: vi.fn(),
  setTimerEditorOpen: vi.fn(),
};

describe("useRoundLifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts with processingRound=false and empty seatWarnings", () => {
    const { result } = renderHook(() => useRoundLifecycle(defaultParams));
    expect(result.current.processingRound).toBe(false);
    expect(result.current.seatWarnings).toEqual([]);
  });

  it("handleBeginRound transitions ready matches to pending and calls refreshMatches", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>,
    );

    const refreshMatches = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, refreshMatches }),
    );

    await act(async () => {
      await result.current.handleBeginRound();
    });

    expect(supabase.from).toHaveBeenCalledWith("tournament_matches");
    expect(refreshMatches).toHaveBeenCalled();
    expect(result.current.processingRound).toBe(false);
  });

  it("handleBeginRound does nothing when tournament is null", async () => {
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, tournament: null }),
    );
    await act(async () => {
      await result.current.handleBeginRound();
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("handlePublishPairings marks matches pairings_published optimistically", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>,
    );

    const setMatches = vi.fn();
    const refreshMatches = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, setMatches, refreshMatches }),
    );

    await act(async () => {
      await result.current.handlePublishPairings();
    });

    expect(setMatches).toHaveBeenCalled();
    expect(refreshMatches).toHaveBeenCalled();
  });

  it("handleCompleteTournament calls savePendingResults then updates tournament", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>,
    );

    const savePendingResults = vi.fn().mockResolvedValue(undefined);
    const setTournament = vi.fn();
    const setSelectedRound = vi.fn();
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, savePendingResults, setTournament, setSelectedRound }),
    );

    await act(async () => {
      await result.current.handleCompleteTournament();
    });

    expect(savePendingResults).toHaveBeenCalled();
    expect(setTournament).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(setSelectedRound).toHaveBeenCalledWith("standings");
  });

  it("handlePauseTimer updates tournament state with elapsed time", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ error: null }) as unknown as ReturnType<typeof supabase.from>,
    );

    const startedAt = new Date(Date.now() - 30_000).toISOString();
    const setTournament = vi.fn();
    const { result } = renderHook(() =>
      useRoundLifecycle({
        ...defaultParams,
        tournament: {
          ...MOCK_TOURNAMENT,
          round_duration_minutes: 50,
          current_round_started_at: startedAt,
          round_is_paused: false,
        },
        setTournament,
      }),
    );

    await act(async () => {
      await result.current.handlePauseTimer();
    });

    expect(setTournament).toHaveBeenCalledWith(
      expect.objectContaining({ round_is_paused: true }),
    );
  });

  it("handleAddRound does nothing when tournament is null", async () => {
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, tournament: null }),
    );
    await act(async () => {
      await result.current.handleAddRound();
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("handleDeleteRound does nothing if round has matches", async () => {
    const matches = [makeMatch({ round_number: 3 })];
    const { result } = renderHook(() =>
      useRoundLifecycle({
        ...defaultParams,
        tournament: { ...MOCK_TOURNAMENT, num_rounds: 3 },
        matches,
      }),
    );
    await act(async () => {
      await result.current.handleDeleteRound(3);
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("handleSaveRoundNote calls supabase and updates tournament", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ error: null }) as unknown as ReturnType<typeof supabase.from>,
    );

    const setTournament = vi.fn();
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, setTournament }),
    );

    await act(async () => {
      await result.current.handleSaveRoundNote("Round 1 notes");
    });

    expect(supabase.from).toHaveBeenCalledWith("tournaments");
    expect(setTournament).toHaveBeenCalledWith(
      expect.objectContaining({ round_note: "Round 1 notes" }),
    );
  });

  it("setError is called when handleBeginRound supabase call fails", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeChain({ data: null, error: { message: "DB error" } }) as unknown as ReturnType<typeof supabase.from>,
    );

    const setError = vi.fn();
    const { result } = renderHook(() =>
      useRoundLifecycle({ ...defaultParams, setError }),
    );

    await act(async () => {
      await result.current.handleBeginRound();
    });

    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith(expect.stringContaining("DB error")),
    );
  });
});
