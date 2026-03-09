import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTournament } from "./useTournament";
import type { TournamentSummary } from "../types/tournament";
import type { User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Mock Supabase — intercept the client before it makes any network calls
// ---------------------------------------------------------------------------

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from "../supabaseClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOURNAMENT_ID = "tournament-xyz";

/** Minimal User fixture (only the id field matters for the hook). */
const MOCK_USER = { id: "user-1" } as User;

const MOCK_TOURNAMENT: TournamentSummary = {
  id: TOURNAMENT_ID,
  name: "Test Cup",
  status: "active",
  tournament_type: "swiss",
  num_rounds: 4,
  created_at: "2024-01-01T00:00:00Z",
  created_by: "user-1",
};

/**
 * Configure supabase.from("tournaments").select(...).eq(...)[.eq(...)].maybeSingle()
 * to resolve with the given response.
 *
 * The chain uses a single object for all methods so chained `.eq()` calls all
 * share the same mock (both the id filter and the optional workspace_id filter).
 */
function mockSupabaseResponse(response: {
  data: TournamentSummary | null;
  error: { message: string } | null;
}) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(response);

  vi.mocked(supabase.from).mockReturnValue(
    chain as unknown as ReturnType<typeof supabase.from>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTournament", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Guard conditions — hook should not fetch
  // -------------------------------------------------------------------------

  it("sets error immediately when id is undefined", () => {
    const { result } = renderHook(() =>
      useTournament(undefined, MOCK_USER, false),
    );

    expect(result.current.error).toBe("Missing tournament id");
    expect(result.current.loading).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not fetch while auth is loading", () => {
    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, true /* authLoading */),
    );

    // loading stays true (initial), no Supabase call
    expect(result.current.loading).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not fetch when user is null", () => {
    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, null, false),
    );

    expect(result.current.loading).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Successful fetch
  // -------------------------------------------------------------------------

  it("returns the tournament on a successful fetch", async () => {
    mockSupabaseResponse({ data: MOCK_TOURNAMENT, error: null });

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tournament).toEqual(MOCK_TOURNAMENT);
    expect(result.current.error).toBeNull();
  });

  it("queries the tournaments table", async () => {
    mockSupabaseResponse({ data: MOCK_TOURNAMENT, error: null });

    renderHook(() => useTournament(TOURNAMENT_ID, MOCK_USER, false));

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("tournaments"));
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  it("sets 'Tournament not found' when data is null", async () => {
    mockSupabaseResponse({ data: null, error: null });

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Tournament not found");
    expect(result.current.tournament).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("sets error on a Supabase error response", async () => {
    mockSupabaseResponse({
      data: null,
      error: { message: "Permission denied" },
    });

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Permission denied");
    expect(result.current.tournament).toBeNull();
  });

  it("sets error when the fetch throws unexpectedly", async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockRejectedValue(new Error("Network timeout"));

    vi.mocked(supabase.from).mockReturnValue(
      chain as unknown as ReturnType<typeof supabase.from>,
    );

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network timeout");
  });

  // -------------------------------------------------------------------------
  // Workspace scoping
  // -------------------------------------------------------------------------

  it("applies an additional workspace_id filter when workspaceId is provided", async () => {
    const chain: Record<string, unknown> = {};
    const eqSpy = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = eqSpy;
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: MOCK_TOURNAMENT, error: null });

    vi.mocked(supabase.from).mockReturnValue(
      chain as unknown as ReturnType<typeof supabase.from>,
    );

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false, "workspace-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // eq() should have been called twice: once for id, once for workspace_id
    expect(eqSpy).toHaveBeenCalledWith("id", TOURNAMENT_ID);
    expect(eqSpy).toHaveBeenCalledWith("workspace_id", "workspace-1");
  });

  it("does not apply workspace_id filter when workspaceId is null", async () => {
    const chain: Record<string, unknown> = {};
    const eqSpy = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = eqSpy;
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: MOCK_TOURNAMENT, error: null });

    vi.mocked(supabase.from).mockReturnValue(
      chain as unknown as ReturnType<typeof supabase.from>,
    );

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false, null),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // eq() called only once (for id)
    expect(eqSpy).toHaveBeenCalledTimes(1);
    expect(eqSpy).toHaveBeenCalledWith("id", TOURNAMENT_ID);
  });

  // -------------------------------------------------------------------------
  // refetch
  // -------------------------------------------------------------------------

  it("exposes a refetch that re-queries Supabase", async () => {
    mockSupabaseResponse({ data: MOCK_TOURNAMENT, error: null });

    const { result } = renderHook(() =>
      useTournament(TOURNAMENT_ID, MOCK_USER, false),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedTournament = { ...MOCK_TOURNAMENT, name: "Updated Cup" };
    mockSupabaseResponse({ data: updatedTournament, error: null });

    await result.current.refetch();

    await waitFor(() =>
      expect(result.current.tournament?.name).toBe("Updated Cup"),
    );
  });
});
