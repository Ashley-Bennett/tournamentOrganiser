import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../supabaseClient", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import { useMyBadges, useMyCardGames, resetBadgeRefresh } from "./useMyBadges";

const rpc = vi.mocked(supabase.rpc);

const badgeRow = (over: Record<string, unknown> = {}) => ({
  badge_id: "attendance",
  badge_count: 8,
  workspace_id: "ws-1",
  workspace_name: "Bulwark",
  game_id: null,
  earned_at: ["2026-01-01T00:00:00.000Z"],
  ...over,
});

function route(handlers: Record<string, unknown>) {
  rpc.mockImplementation(((name: string) =>
    Promise.resolve(
      handlers[name] ?? { data: [], error: null },
    )) as unknown as typeof supabase.rpc);
}

beforeEach(() => {
  rpc.mockReset();
  resetBadgeRefresh();
});

describe("useMyBadges", () => {
  it("refreshes before reading, so the rows are not stale", async () => {
    const calls: string[] = [];
    rpc.mockImplementation(((name: string) => {
      calls.push(name);
      return Promise.resolve({
        data: name === "get_my_badges" ? [badgeRow()] : null,
        error: null,
      });
    }) as unknown as typeof supabase.rpc);

    const { result } = renderHook(() => useMyBadges());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(calls).toEqual(["refresh_my_badges", "get_my_badges"]);
  });

  it("maps rows onto the shape the registry expects", async () => {
    route({ get_my_badges: { data: [badgeRow()], error: null } });

    const { result } = renderHook(() => useMyBadges());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.badges).toEqual([
      {
        badgeId: "attendance",
        count: 8,
        workspaceId: "ws-1",
        workspaceName: "Bulwark",
        gameId: null,
        earnedAt: ["2026-01-01T00:00:00.000Z"],
      },
    ]);
  });

  // Recomputing is cheap but not free, and every screen showing a card would
  // otherwise ask for it again.
  it("refreshes once per session however many callers there are", async () => {
    route({ get_my_badges: { data: [], error: null } });

    const a = renderHook(() => useMyBadges());
    const b = renderHook(() => useMyBadges());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));

    const refreshes = rpc.mock.calls.filter(
      (c) => c[0] === "refresh_my_badges",
    );
    expect(refreshes).toHaveLength(1);
  });

  // Whatever was saved last time is still readable; the badges are just a
  // little stale. Failing the whole screen would be worse.
  it("still reads badges when the refresh fails", async () => {
    rpc.mockImplementation(((name: string) =>
      Promise.resolve(
        name === "refresh_my_badges"
          ? { data: null, error: { message: "nope" } }
          : { data: [badgeRow()], error: null },
      )) as unknown as typeof supabase.rpc);

    const { result } = renderHook(() => useMyBadges());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.badges).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("lets a later caller retry after a failed refresh", async () => {
    rpc.mockImplementation(((name: string) =>
      Promise.resolve(
        name === "refresh_my_badges"
          ? { data: null, error: { message: "nope" } }
          : { data: [], error: null },
      )) as unknown as typeof supabase.rpc);

    const a = renderHook(() => useMyBadges());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useMyBadges());
    await waitFor(() => expect(b.result.current.loading).toBe(false));

    const refreshes = rpc.mock.calls.filter(
      (c) => c[0] === "refresh_my_badges",
    );
    expect(refreshes.length).toBeGreaterThan(1);
  });

  it("surfaces a read failure", async () => {
    rpc.mockImplementation(((name: string) =>
      Promise.resolve(
        name === "get_my_badges"
          ? { data: null, error: { message: "boom" } }
          : { data: null, error: null },
      )) as unknown as typeof supabase.rpc);

    const { result } = renderHook(() => useMyBadges());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("boom");
    expect(result.current.badges).toEqual([]);
  });

  it("does nothing at all when disabled", async () => {
    const { result } = renderHook(() => useMyBadges(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("useMyCardGames", () => {
  it("reports the games a card exists for", async () => {
    route({
      get_my_card_games: {
        data: [
          { game_id: "pokemon", entries: 6, last_played: "2026-08-30" },
          { game_id: "generic", entries: 3, last_played: "2026-09-01" },
        ],
        error: null,
      },
    });

    const { result } = renderHook(() => useMyCardGames());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.games.map((g) => g.game_id)).toEqual([
      "pokemon",
      "generic",
    ]);
    expect(result.current.hasCard).toBe(true);
  });

  // No entries means no card has been earned, and the entry point on the
  // account page should not appear at all.
  it("reports no card when nothing has been played", async () => {
    route({ get_my_card_games: { data: [], error: null } });

    const { result } = renderHook(() => useMyCardGames());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasCard).toBe(false);
  });

  it("does not refresh badges — that is the other hook's job", async () => {
    route({ get_my_card_games: { data: [], error: null } });

    const { result } = renderHook(() => useMyCardGames());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(
      rpc.mock.calls.filter((c) => c[0] === "refresh_my_badges"),
    ).toHaveLength(0);
  });
});
