import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Badges from "./Badges";
import { BADGES } from "../badges/registry";
import type { EarnedBadge } from "../badges/types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 8, workspaceId: WS, workspaceName: "Bulwark" },
];

const state = {
  badges: held as EarnedBadge[],
  games: [{ game_id: "pokemon", entries: 3, last_played: "2026-08-01" }],
};

vi.mock("../hooks/useMyBadges", () => ({
  useMyBadges: () => ({
    badges: state.badges,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useMyCardGames: () => ({
    games: state.games,
    loading: false,
    error: null,
    hasCard: state.games.length > 0,
  }),
}));

function setup() {
  render(
    <MemoryRouter>
      <Badges />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.badges = held;
  state.games = [{ game_id: "pokemon", entries: 3, last_played: "2026-08-01" }];
});

describe("the badge wall", () => {
  // The point of a catalogue is the part you have not got to yet.
  it("shows locked badges as well as held ones", () => {
    setup();
    expect(
      screen.getAllByRole("button", { name: /not yet earned/i }).length,
    ).toBe(BADGES.length - 1);
  });

  it("shows a held badge at the rung it has reached", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    ).toBeInTheDocument();
  });

  it("has a cell for every badge in the catalogue", () => {
    setup();
    // Every cell is a button; the back link is a link, and the tabs are not
    // rendered for a single game.
    expect(screen.getAllByRole("button")).toHaveLength(BADGES.length);
  });

  it("renders a full wall for somebody with nothing", () => {
    state.badges = [];
    setup();
    expect(
      screen.getAllByRole("button", { name: /not yet earned/i }),
    ).toHaveLength(BADGES.length);
  });

  // A single tab is a label pretending to be a control.
  it("shows game tabs only when there is a choice", () => {
    setup();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("offers a tab per game when there is more than one", () => {
    state.games = [
      { game_id: "pokemon", entries: 3, last_played: "2026-08-01" },
      { game_id: "generic", entries: 1, last_played: "2026-07-01" },
    ];
    setup();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("leads back to the account page", () => {
    setup();
    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute(
      "href",
      "/me",
    );
  });
});

describe("opening a badge", () => {
  it("explains what it is, with the number in it", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("8 events finished here"),
    ).toBeInTheDocument();
  });

  // Somebody should be able to see where a badge goes, not only the next step.
  it("shows the whole ladder", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Institution")).toBeInTheDocument();
    expect(within(dialog).getByText("17 more to Silver")).toBeInTheDocument();
  });

  it("says plainly when a badge is not held", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: /^Spoiler — not yet earned$/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Not yet earned")).toBeInTheDocument();
    // Untiered: there is no ladder to show.
    expect(within(dialog).queryByText("Ranks")).toBeNull();
  });

  it("closes again", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
