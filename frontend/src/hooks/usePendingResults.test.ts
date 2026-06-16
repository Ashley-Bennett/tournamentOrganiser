import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePendingResults } from "./usePendingResults";
import type { MatchWithPlayers, MatchReportRow } from "../types/match";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";

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
    status: "pending",
    confirmed_by: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeReport(overrides: Partial<MatchReportRow> = {}): MatchReportRow {
  return {
    match_id: "m1",
    player1_id: "p1",
    player1_name: "Alice",
    player2_id: "p2",
    player2_name: "Bob",
    player1_report: null,
    player2_report: null,
    conflict_status: "partial",
    ...overrides,
  };
}

const defaultParams = {
  matches: [makeMatch()],
  matchReports: new Map<string, MatchReportRow>(),
  refreshMatches: vi.fn().mockResolvedValue(undefined),
  setError: vi.fn(),
  setUpdatingMatch: vi.fn(),
};

describe("usePendingResults", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts with empty pendingResults", () => {
    const { result } = renderHook(() => usePendingResults(defaultParams));
    expect(result.current.pendingResults.size).toBe(0);
  });

  it("restores temp results from matches on first load", async () => {
    const matches = [
      makeMatch({ id: "m1", status: "pending", temp_result: "1-0", temp_winner_id: "p1" }),
    ];
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matches }),
    );
    await waitFor(() =>
      expect(result.current.pendingResults.get("m1")).toEqual({
        winnerId: "p1",
        result: "1-0",
      }),
    );
  });

  it("does not restore temp results for completed matches", async () => {
    const matches = [
      makeMatch({ id: "m1", status: "completed", temp_result: "1-0", temp_winner_id: "p1" }),
    ];
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matches }),
    );
    // Give it a tick to run the effect
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.pendingResults.size).toBe(0);
  });

  it("removes stale entries for deleted matches", async () => {
    // Start with a match that has a pending result
    const matches = [
      makeMatch({ id: "m1", temp_result: "1-0", temp_winner_id: "p1" }),
    ];
    const { result, rerender } = renderHook(
      (props: typeof defaultParams) => usePendingResults(props),
      { initialProps: { ...defaultParams, matches } },
    );

    await waitFor(() => expect(result.current.pendingResults.has("m1")).toBe(true));

    // Now the match is removed (e.g., deleted from DB)
    rerender({ ...defaultParams, matches: [] });

    // pendingResults should be cleaned up (but only when matches.length > 0 triggers cleanup)
    // The cleanup effect guards on matches.length === 0, so the stale entry stays until
    // a new matches list with at least one entry arrives that doesn't include m1.
    const newMatches = [makeMatch({ id: "m2", player1_id: "p3", player1_name: "Carol" })];
    rerender({ ...defaultParams, matches: newMatches });

    await waitFor(() => expect(result.current.pendingResults.has("m1")).toBe(false));
  });

  it("syncs non-conflicting player1 win report into pendingResults", async () => {
    const report = makeReport({ player1_report: "win", conflict_status: "partial" });
    const matchReports = new Map([["m1", report]]);
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matchReports }),
    );
    await waitFor(() =>
      expect(result.current.pendingResults.get("m1")).toEqual({
        winnerId: "p1",
        result: "1-0",
      }),
    );
  });

  it("syncs draw report into pendingResults", async () => {
    const report = makeReport({ player1_report: "draw", conflict_status: "agreed" });
    const matchReports = new Map([["m1", report]]);
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matchReports }),
    );
    await waitFor(() =>
      expect(result.current.pendingResults.get("m1")).toEqual({
        winnerId: null,
        result: "Draw",
      }),
    );
  });

  it("skips conflict reports", async () => {
    const report = makeReport({ player1_report: "win", conflict_status: "conflict" });
    const matchReports = new Map([["m1", report]]);
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matchReports }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.pendingResults.size).toBe(0);
  });

  it("handleQuickResult sets pending result and saves temp to DB", async () => {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue(
      chain as unknown as ReturnType<typeof supabase.from>,
    );

    const { result } = renderHook(() => usePendingResults(defaultParams));
    const match = makeMatch();
    await act(async () => {
      await result.current.handleQuickResult(match, "player1");
    });

    expect(result.current.pendingResults.get("m1")).toEqual({
      winnerId: "p1",
      result: "1-0",
    });
    expect(supabase.from).toHaveBeenCalledWith("tournament_matches");
  });

  it("savePendingResults calls refreshMatches after saving", async () => {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue(
      chain as unknown as ReturnType<typeof supabase.from>,
    );

    const matches = [makeMatch({ temp_result: "1-0", temp_winner_id: "p1" })];
    const refreshMatches = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePendingResults({ ...defaultParams, matches, refreshMatches }),
    );

    await waitFor(() => expect(result.current.pendingResults.has("m1")).toBe(true));
    await result.current.savePendingResults();

    expect(refreshMatches).toHaveBeenCalled();
  });
});
