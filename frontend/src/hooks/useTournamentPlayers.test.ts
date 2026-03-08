import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTournamentPlayers } from "./useTournamentPlayers";
import type { TournamentPlayer } from "../types/tournament";

// ---------------------------------------------------------------------------
// Mock Supabase — intercept the client before it makes any network calls
// ---------------------------------------------------------------------------

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn() },
}));

// Import after mock so we get the mocked version
import { supabase } from "../supabaseClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOURNAMENT_ID = "tournament-abc";

/** Build a minimal TournamentPlayer fixture. */
function makePlayer(id: string, name: string): TournamentPlayer {
  return { id, name, created_at: "2024-01-01T00:00:00Z" };
}

/**
 * Configure supabase.from(...).select(...).eq(...).order(...) to resolve with
 * the given data/error.
 */
function mockSupabaseResponse(response: {
  data: TournamentPlayer[] | null;
  error: { message: string } | null;
}) {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(response),
      }),
    }),
  } as ReturnType<typeof supabase.from>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTournamentPlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with an empty players array and loading=false when no tournamentId", () => {
    const { result } = renderHook(() => useTournamentPlayers(undefined));

    expect(result.current.loading).toBe(false);
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("does not call Supabase when tournamentId is undefined", () => {
    renderHook(() => useTournamentPlayers(undefined));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns players after a successful fetch", async () => {
    const players = [
      makePlayer("p1", "Alice"),
      makePlayer("p2", "Bob"),
    ];
    mockSupabaseResponse({ data: players, error: null });

    const { result } = renderHook(() => useTournamentPlayers(TOURNAMENT_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.players).toEqual(players);
    expect(result.current.error).toBeNull();
  });

  it("queries the correct table and tournament", async () => {
    mockSupabaseResponse({ data: [], error: null });

    renderHook(() => useTournamentPlayers(TOURNAMENT_ID));

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("tournament_players"));
  });

  it("sets error and clears players on a Supabase error", async () => {
    mockSupabaseResponse({ data: null, error: { message: "DB connection failed" } });

    const { result } = renderHook(() => useTournamentPlayers(TOURNAMENT_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("DB connection failed");
    expect(result.current.players).toEqual([]);
  });

  it("sets a generic error message when the error has no message", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockRejectedValue(new Error("Network error")),
        }),
      }),
    } as ReturnType<typeof supabase.from>);

    const { result } = renderHook(() => useTournamentPlayers(TOURNAMENT_ID));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
  });

  it("re-fetches when tournamentId changes", async () => {
    const firstPlayers = [makePlayer("p1", "Alice")];
    const secondPlayers = [makePlayer("p2", "Bob"), makePlayer("p3", "Carol")];

    mockSupabaseResponse({ data: firstPlayers, error: null });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTournamentPlayers(id),
      { initialProps: { id: "tournament-1" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toHaveLength(1);

    mockSupabaseResponse({ data: secondPlayers, error: null });
    rerender({ id: "tournament-2" });

    await waitFor(() => expect(result.current.players).toHaveLength(2));
    expect(result.current.error).toBeNull();
  });

  it("exposes a refetch function that re-runs the query", async () => {
    const initial = [makePlayer("p1", "Alice")];
    const updated = [makePlayer("p1", "Alice"), makePlayer("p2", "Bob")];

    mockSupabaseResponse({ data: initial, error: null });

    const { result } = renderHook(() => useTournamentPlayers(TOURNAMENT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toHaveLength(1);

    mockSupabaseResponse({ data: updated, error: null });
    await result.current.refetch();

    await waitFor(() => expect(result.current.players).toHaveLength(2));
  });
});
