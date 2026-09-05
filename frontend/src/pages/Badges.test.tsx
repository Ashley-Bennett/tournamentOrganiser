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
  // CollapsibleSection remembers its open state per browser, so a test that
  // collapses a section would otherwise leave it collapsed for the next one.
  localStorage.clear();
  state.badges = held;
  state.games = [{ game_id: "pokemon", entries: 3, last_played: "2026-08-01" }];
});

const section = (name: RegExp | string) => screen.getByRole("button", { name, expanded: true });

describe("the sections", () => {
  it("shows a heading per provenance the player has something in", () => {
    setup();
    expect(section(/^Open Play Badges/)).toBeInTheDocument();
    expect(section(/^League Badges/)).toBeInTheDocument();
  });

  it("keeps each provenance in its own section", () => {
    setup();
    // Both on the page at once: these are sections, not alternatives.
    expect(screen.getByRole("button", { name: "Champion" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Familiar Face \u00b7 Bulwark" }),
    ).toBeInTheDocument();
  });

  // The point of a catalogue is the part you have not got to yet.
  it("shows locked badges as well as held ones", () => {
    setup();
    expect(
      screen.getAllByRole("button", { name: /not yet earned/i }).length,
    ).toBe(SYSTEM_COUNT - 1);
  });

  // A badge case is a thing you fill, so how much is left is the question
  // somebody opens it with.
  it("counts what is collected against what there is", () => {
    setup();
    expect(screen.getByText(`1/${SYSTEM_COUNT} collected`)).toBeInTheDocument();
    // The league shelf has its own total, counted separately.
    expect(screen.getByText("1/1 collected")).toBeInTheDocument();
  });

  it("collapses a section without touching the others", async () => {
    setup();
    await userEvent.click(section(/^Open Play Badges/));

    expect(
      screen.getByRole("button", { name: /^Open Play Badges/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /^League Badges/ }),
    ).toHaveAttribute("aria-expanded", "true");
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

describe("clubs, inside the leagues section", () => {
  // A heading promising a shelf that holds nothing is worse than no heading.
  it("hides Leagues for a player who has played at no club", () => {
    state.badges = [
      { badgeId: "champion", count: 1, workspaceId: null, gameId: "pokemon" },
    ];
    setup();
    expect(screen.queryByRole("button", { name: /League Badges/ })).toBeNull();
  });

  // Nothing in the catalogue is a closed set yet, so the section stays hidden
  // until one exists. It appears on its own the moment one is added.
  it("hides Promos while the catalogue has no closed sets", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Promo Badges/ })).toBeNull();
  });

  it("needs no club tabs when there is only one", () => {
    setup();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  // "Regular" means something different at each club.
  it("offers a tab per club, counting each separately", async () => {
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
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Bulwark",
      "Red Dragon",
    ]);
    expect(
      screen.getByRole("button", { name: "Regular \u00b7 Bulwark" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Red Dragon" }));
    expect(
      screen.getByRole("button", { name: "Attendee \u00b7 Red Dragon" }),
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

  it("opens a club badge when the shelf and club are named too", () => {
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
    expect(screen.getByText("Badge Case")).toBeInTheDocument();
  });

  // A stale link should not strand somebody on a club they have never played.
  it("falls back to the player's own club when the url names an unknown one", () => {
    setup("?league=00000000-0000-0000-0000-000000000000");
    expect(
      screen.getByRole("button", { name: "Familiar Face · Bulwark" }),
    ).toBeInTheDocument();
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

describe("the game", () => {
  // It arrives already chosen from the card. Being asked again for something
  // already decided is the question this page exists to not ask.
  it("offers no game picker", () => {
    twoGames();
    setup("?game=pokemon");
    expect(screen.queryByRole("button", { name: "Generic tournament" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Generic tournament" })).toBeNull();
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
});
