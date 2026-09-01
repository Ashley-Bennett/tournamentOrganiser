import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PlayerManagementDialog from "./PlayerManagementDialog";
import type { TournamentPlayer } from "../../types/match";

const player = (
  id: string,
  name: string,
  overrides: Partial<TournamentPlayer> = {},
): TournamentPlayer => ({
  id,
  name,
  user_id: null,
  dropped: false,
  dropped_at_round: null,
  has_static_seating: false,
  static_seat_number: null,
  is_late_entry: false,
  late_entry_round: null,
  deck_pokemon1: null,
  deck_pokemon2: null,
  link_requested_at: null,
  ...overrides,
});

const PLAYERS = [
  player("p1", "Ada"),
  player("p2", "Bo"),
  player("p3", "Cy"),
];

const handlers = {
  onClose: vi.fn(),
  onToggleDrop: vi.fn(),
  onRemoveFromRound: vi.fn(),
  onDeleteEntry: vi.fn(),
  onClearLinkRequest: vi.fn(),
  onUpdateStaticSeat: vi.fn(),
};

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <PlayerManagementDialog
      open
      players={PLAYERS}
      finalStandingsById={new Map()}
      togglingDrop={null}
      savingSeat={null}
      currentRound={2}
      playersInRound={new Set(["p1", "p2"])}
      playersWithResults={new Set()}
      busyPlayerId={null}
      {...handlers}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlayerManagementDialog — taking a player out of a round", () => {
  it("offers the action only for players paired in the round on screen", () => {
    renderDialog();
    // Ada and Bo are in round 2; Cy is not.
    expect(screen.getAllByRole("button", { name: "Take out of Round 2" })).toHaveLength(2);
  });

  it("offers nothing to take out while the standings tab is open", () => {
    renderDialog({ currentRound: null, playersInRound: new Set<string>() });
    expect(screen.queryByRole("button", { name: /Take out of Round/ })).toBeNull();
  });

  it("reports the round it is removing them from once confirmed", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getAllByRole("button", { name: "Take out of Round 2" })[0]);
    expect(
      screen.getByText(/Their opponent gets a bye for the round/),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Take out of round" }));
    expect(handlers.onRemoveFromRound).toHaveBeenCalledWith("p1", 2);
  });

  it("does nothing until the organiser confirms", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getAllByRole("button", { name: "Take out of Round 2" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.onRemoveFromRound).not.toHaveBeenCalled();
  });
});

describe("PlayerManagementDialog — deleting an entry", () => {
  it("is offered while the player has no result to lose", () => {
    renderDialog();
    expect(screen.getAllByRole("button", { name: "Delete entry" })).toHaveLength(3);
  });

  it("is withdrawn once a player has played a real match", () => {
    renderDialog({ playersWithResults: new Set(["p1", "p2"]) });
    expect(screen.getAllByRole("button", { name: "Delete entry" })).toHaveLength(1);
  });

  it("points the organiser at drop for someone who has been playing", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getAllByRole("button", { name: "Delete entry" })[0]);
    expect(screen.getByText(/drop them instead so their results are kept/)).toBeTruthy();

    await user.click(
      screen.getAllByRole("button", { name: "Delete entry" }).at(-1)!,
    );
    expect(handlers.onDeleteEntry).toHaveBeenCalledWith("p1");
  });
});

describe("PlayerManagementDialog — link requests", () => {
  it("flags an entry a player says is theirs", () => {
    renderDialog({
      players: [player("p1", "Ada", { link_requested_at: "2026-09-01T10:00:00Z" })],
      playersInRound: new Set<string>(),
    });
    expect(screen.getByText("Wants to link")).toBeTruthy();
    expect(screen.getByText(/Send them a claim link/)).toBeTruthy();
  });

  it("lets the organiser dismiss the flag", async () => {
    const user = userEvent.setup();
    renderDialog({
      players: [player("p1", "Ada", { link_requested_at: "2026-09-01T10:00:00Z" })],
      playersInRound: new Set<string>(),
    });

    await user.click(screen.getByTestId("CancelIcon"));
    expect(handlers.onClearLinkRequest).toHaveBeenCalledWith("p1");
  });
});
