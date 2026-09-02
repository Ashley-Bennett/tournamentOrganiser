import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../supabaseClient", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "../supabaseClient";
import RecordHistory from "./RecordHistory";

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function row(overrides: Record<string, unknown> = {}) {
  return {
    changed_at: new Date().toISOString(),
    operation: "UPDATE",
    actor: "organiser@example.com",
    actor_kind: "account",
    changed_fields: ["dropped"],
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("RecordHistory — when it appears at all", () => {
  it("renders nothing for a record that has never been changed", () => {
    const { container } = render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not query the audit log for an unchanged record", () => {
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={0} />,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows how many changes there are, so the panel is worth opening", () => {
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={3} />,
    );
    expect(screen.getByText("History (3)")).toBeInTheDocument();
  });

  it("falls back to a plain label when no count is supplied", () => {
    render(<RecordHistory table="tournament_players" recordId="p1" />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

describe("RecordHistory — contents", () => {
  it("loads only once opened", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );
    expect(rpc).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("History (1)"));
    expect(rpc).toHaveBeenCalledWith("get_record_history", {
      p_table_name: "tournament_players",
      p_record_id: "p1",
    });
    expect(await screen.findByText("organiser@example.com")).toBeInTheDocument();
  });

  it("names the actor and the fields they changed", async () => {
    rpc.mockResolvedValue({
      data: [row({ changed_fields: ["dropped", "dropped_at_round"] })],
      error: null,
    });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );
    await userEvent.click(screen.getByText("History (1)"));

    expect(
      await screen.findByText(/changed dropped, dropped at round/),
    ).toBeInTheDocument();
  });

  it("says 'Someone' rather than inventing an actor for unattributed rows", async () => {
    // Everything written before the actor label shipped has no attribution.
    rpc.mockResolvedValue({
      data: [
        row({
          operation: "INSERT",
          actor: "Unknown",
          actor_kind: "unattributed",
          changed_fields: null,
        }),
      ],
      error: null,
    });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );
    await userEvent.click(screen.getByText("History (1)"));

    expect(await screen.findByText(/Someone created/)).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });

  it("marks an anonymous player's own action as coming from a player", async () => {
    rpc.mockResolvedValue({
      data: [row({ actor: "Tom Ellery", actor_kind: "player" })],
      error: null,
    });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );
    await userEvent.click(screen.getByText("History (1)"));

    expect(await screen.findByText("Tom Ellery")).toBeInTheDocument();
    expect(screen.getByText("player")).toBeInTheDocument();
  });

  it("refetches on each open, so a change made in the same dialog shows up", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );

    await userEvent.click(screen.getByText("History (1)"));
    expect(await screen.findByText("organiser@example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByText("History (1)"));
    await userEvent.click(screen.getByText("History (1)"));

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reports a failure instead of showing an empty history", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    render(
      <RecordHistory table="tournament_players" recordId="p1" changeCount={1} />,
    );
    await userEvent.click(screen.getByText("History (1)"));

    expect(
      await screen.findByText(/Could not load the history/),
    ).toBeInTheDocument();
  });
});
