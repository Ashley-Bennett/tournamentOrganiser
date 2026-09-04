import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Badges from "./Badges";
import { BADGES } from "../badges/registry";
import type { EarnedBadge } from "../badges/types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const SYSTEM_COUNT = BADGES.filter((b) => b.provenance !== "league").length;

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 8, workspaceId: WS, workspaceName: "Bulwark" },
  { badgeId: "champion", count: 1, workspaceId: null, gameId: "pokemon" },
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

function setup(search = "") {
  render(
    <MemoryRouter initialEntries={[`/me/badges${search}`]}>
      <Badges />
    </MemoryRouter>,
  );
}

const twoGames = () => {
  state.games = [
    { game_id: "pokemon", entries: 3, last_played: "2026-08-01" },
    { game_id: "generic", entries: 1, last_played: "2026-07-01" },
  ];
};

beforeEach(() => {
  state.badges = held;
  state.games = [{ game_id: "pokemon", entries: 3, last_played: "2026-08-01" }];
});

describe("the wall opens on the badges that belong to nobody", () => {
  it("shows the system badges, not the club ones", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Champion" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bulwark/ })).toBeNull();
  });

  it("has a cell for every badge on that shelf", () => {
    setup();
    // Cells only: the back link is a link, and the tabs carry role="tab".
    expect(screen.getAllByRole("button")).toHaveLength(SYSTEM_COUNT);
  });

  // The point of a catalogue is the part you have not got to yet.
  it("shows locked badges as well as held ones", () => {
    setup();
    expect(
      screen.getAllByRole("button", { name: /not yet earned/i }).length,
    ).toBe(SYSTEM_COUNT - 1);
  });

  it("names the game it is about", () => {
    setup();
    expect(screen.getByText(/Pok.mon TCG events/)).toBeInTheDocument();
  });

  it("leads back to the account page", () => {
    setup();
    expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute(
      "href",
      "/me",
    );
  });
});

describe("club tabs", () => {
  it("offers Anywhere plus a tab per club", () => {
    setup();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Anywhere",
      "Bulwark",
    ]);
  });

  // One tab is a label pretending to be a control.
  it("shows no tabs for a player with no club badges yet", () => {
    state.badges = [
      { badgeId: "champion", count: 1, workspaceId: null, gameId: "pokemon" },
    ];
    setup();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows a club's badges when its tab is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("tab", { name: "Bulwark" }));
    expect(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Champion" })).toBeNull();
  });

  // "Regular" means something different at each club.
  it("counts each club separately", async () => {
    state.badges = [
      { badgeId: "attendance", count: 30, workspaceId: WS, workspaceName: "Bulwark" },
      {
        badgeId: "attendance",
        count: 2,
        workspaceId: OTHER_WS,
        workspaceName: "Red Dragon",
      },
    ];
    setup();
    await userEvent.click(screen.getByRole("tab", { name: "Red Dragon" }));
    expect(
      screen.getByRole("button", { name: "Attendee · Red Dragon" }),
    ).toBeInTheDocument();
  });
});

describe("deep links", () => {
  // What a badge notification is for: "this one moved", not "here are thirty".
  it("opens the badge named in the url", () => {
    setup("?badge=champion");
    expect(
      within(screen.getByRole("dialog")).getByText("1 tournament win"),
    ).toBeInTheDocument();
  });

  it("opens a club badge when the club is named too", () => {
    setup(`?league=${WS}&badge=attendance`);
    expect(
      within(screen.getByRole("dialog")).getByText("8 events finished here"),
    ).toBeInTheDocument();
  });

  it("opens nothing when no badge is named", () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // A link that outlived its badge should land on the wall, not on an error.
  it("ignores a badge the registry has never heard of", () => {
    setup("?badge=not_shipped_yet");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Badges")).toBeInTheDocument();
  });

  // A stale link should not strand somebody on a club they have never played.
  it("falls back to Anywhere when the url names an unknown club", () => {
    setup("?league=00000000-0000-0000-0000-000000000000");
    expect(screen.getByRole("tab", { name: "Anywhere" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects the game named in the url", () => {
    twoGames();
    setup("?game=generic");
    expect(screen.getByText(/Generic tournament events/)).toBeInTheDocument();
  });

  it("falls back when the url names a game the account does not play", () => {
    setup("?game=chess");
    expect(screen.getByText(/Pok.mon TCG events/)).toBeInTheDocument();
  });

  it("closes back to the wall", async () => {
    setup("?badge=champion");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("switching game", () => {
  it("offers a button per game, and only when there is a choice", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Generic tournament" })).toBeNull();

    twoGames();
    setup();
    expect(
      screen.getByRole("button", { name: "Generic tournament" }),
    ).toBeInTheDocument();
  });

  // A club is only a club for the games it runs.
  it("drops the chosen club when the game changes", async () => {
    twoGames();
    setup(`?league=${WS}`);
    await userEvent.click(
      screen.getByRole("button", { name: "Generic tournament" }),
    );
    expect(screen.getByText(/Generic tournament events/)).toBeInTheDocument();
  });
});

describe("opening a badge", () => {
  it("explains what it is, with the number in it", async () => {
    setup();
    await userEvent.click(screen.getByRole("tab", { name: "Bulwark" }));
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
    await userEvent.click(screen.getByRole("tab", { name: "Bulwark" }));
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
});
