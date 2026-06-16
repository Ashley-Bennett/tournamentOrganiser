import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMatchReports } from "./useMatchReports";
import type { MatchReportRow } from "../types/match";

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { supabase } from "../supabaseClient";

const MOCK_REPORT: MatchReportRow = {
  match_id: "m1",
  player1_id: "p1",
  player1_name: "Alice",
  player2_id: "p2",
  player2_name: "Bob",
  player1_report: "win",
  player2_report: null,
  conflict_status: "partial",
};

function mockChannel() {
  const ch: Record<string, unknown> = {};
  ch.on = vi.fn().mockReturnValue(ch);
  ch.subscribe = vi.fn().mockReturnValue(ch);
  vi.mocked(supabase.channel).mockReturnValue(ch as unknown as ReturnType<typeof supabase.channel>);
  vi.mocked(supabase.removeChannel).mockResolvedValue("ok" as never);
  return ch;
}

describe("useMatchReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts with empty matchReports", () => {
    mockChannel();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { result } = renderHook(() =>
      useMatchReports({ tournamentId: "t1", setRefreshTrigger: vi.fn() }),
    );
    expect(result.current.matchReports.size).toBe(0);
  });

  it("populates matchReports from RPC on mount", async () => {
    mockChannel();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [MOCK_REPORT], error: null } as never);
    const { result } = renderHook(() =>
      useMatchReports({ tournamentId: "t1", setRefreshTrigger: vi.fn() }),
    );
    await waitFor(() => expect(result.current.matchReports.size).toBe(1));
    expect(result.current.matchReports.get("m1")).toEqual(MOCK_REPORT);
  });

  it("does not fetch when tournamentId is undefined", () => {
    mockChannel();
    renderHook(() =>
      useMatchReports({ tournamentId: undefined, setRefreshTrigger: vi.fn() }),
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("subscribes to realtime channel on mount", async () => {
    const ch = mockChannel();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    renderHook(() =>
      useMatchReports({ tournamentId: "t1", setRefreshTrigger: vi.fn() }),
    );
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith("match-reports-t1"));
    expect(ch.on).toHaveBeenCalled();
    expect(ch.subscribe).toHaveBeenCalled();
  });

  it("removes channel on unmount", async () => {
    mockChannel();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { unmount } = renderHook(() =>
      useMatchReports({ tournamentId: "t1", setRefreshTrigger: vi.fn() }),
    );
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
