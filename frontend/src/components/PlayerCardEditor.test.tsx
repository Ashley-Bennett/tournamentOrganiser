import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import PlayerCardEditor from "./PlayerCardEditor";
import type { EquippedSlot } from "../badges/card";
import type { EarnedBadge } from "../badges/types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const held: EarnedBadge[] = [
  {
    badgeId: "attendance",
    count: 31,
    workspaceId: WS,
    workspaceName: "Bulwark",
  },
  {
    badgeId: "attendance",
    count: 9,
    workspaceId: OTHER_WS,
    workspaceName: "Red Dragon",
  },
  {
    badgeId: "champion",
    count: 2,
    workspaceId: null,
    workspaceName: null,
    gameId: "pokemon",
  },
  {
    badgeId: "top_cut",
    count: 12,
    workspaceId: null,
    workspaceName: null,
    gameId: "pokemon",
  },
];

const equipped: EquippedSlot[] = [
  { slot: 0, badgeId: "attendance", workspaceId: WS },
  { slot: 1, badgeId: "champion", workspaceId: null },
];

function setup(over: Partial<Parameters<typeof PlayerCardEditor>[0]> = {}) {
  const onChange = vi.fn();
  const onPartnerChange = vi.fn();
  render(
    <MemoryRouter>
      <PlayerCardEditor
      name="Marcus Hale"
      gameId="pokemon"
      partnerKey="25"
      equipped={equipped}
      earned={held}
      onChange={onChange}
      onPartnerChange={onPartnerChange}
        {...over}
      />
    </MemoryRouter>,
  );
  return { onChange, onPartnerChange };
}

const dialog = () => screen.getByRole("dialog");

describe("the card it is editing", () => {
  // The preview is the real component at the real density. A player choosing
  // what a room will see should not have to guess whether the thing they are
  // editing is the thing that gets shown.
  it("previews the card", () => {
    setup();
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.getAllByText("Regular · Bulwark").length).toBeGreaterThan(0);
  });

  it("renders a card with nothing equipped at all", () => {
    setup({ equipped: [] });
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose a title/i }),
    ).toBeInTheDocument();
  });

  it("offers exactly three badge slots", () => {
    setup({ equipped: [] });
    expect(
      screen.getAllByRole("button", { name: /choose a badge for slot/i }),
    ).toHaveLength(3);
  });

  // A badge can stop being held: a workspace deleted, an entry withdrawn.
  it("shows a slot as empty when its badge is no longer held", () => {
    setup({ earned: [] });
    expect(
      screen.getByRole("button", { name: /choose a title/i }),
    ).toBeInTheDocument();
  });
});

describe("taking badges off", () => {
  it("hands back the loadout without the slot that was cleared", async () => {
    const { onChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /take off regular · bulwark/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      { slot: 1, badgeId: "champion", workspaceId: null },
    ]);
  });

  it("leaves the other slots alone", async () => {
    const { onChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /take off two-time/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      { slot: 0, badgeId: "attendance", workspaceId: WS },
    ]);
  });
});

describe("putting badges on", () => {
  it("equips what was picked, into the slot that was opened", async () => {
    const { onChange } = setup({ equipped: [] });
    await userEvent.click(
      screen.getByRole("button", { name: /choose a badge for slot 2/i }),
    );
    await userEvent.click(within(dialog()).getByText("Two-Time"));

    expect(onChange).toHaveBeenCalledWith([
      { slot: 2, badgeId: "champion", workspaceId: null },
    ]);
  });

  // The same mark three times is not a loadout, it is a mistake nobody meant.
  it("does not offer a badge already worn in another slot", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: /choose a badge for slot 2/i }),
    );
    expect(within(dialog()).queryByText("Two-Time")).toBeNull();
    expect(within(dialog()).getByText("Top Cut")).toBeInTheDocument();
  });

  // Opening a filled slot must show what is in it, not a list that
  // mysteriously omits the thing you are looking at.
  it("still offers the badge that is in the slot being changed", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: /change two-time/i }),
    );
    expect(within(dialog()).getByText("Two-Time")).toBeInTheDocument();
  });

  // Regular at two clubs is two different things to wear.
  it("lists the same badge once per league it was earned at", async () => {
    setup({ equipped: [] });
    await userEvent.click(
      screen.getByRole("button", { name: /choose a title/i }),
    );
    expect(within(dialog()).getByText("Regular · Bulwark")).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Familiar Face · Red Dragon"),
    ).toBeInTheDocument();
  });

  it("swaps the badge in a filled slot without disturbing the others", async () => {
    const { onChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /change two-time/i }),
    );
    await userEvent.click(within(dialog()).getByText("Top Cut"));

    expect(onChange).toHaveBeenCalledWith([
      { slot: 0, badgeId: "attendance", workspaceId: WS },
      { slot: 1, badgeId: "top_cut", workspaceId: null },
    ]);
  });
});

describe("the partner", () => {
  it("saves the partner that was picked", async () => {
    const { onPartnerChange } = setup({ gameId: "generic", partnerKey: null });
    await userEvent.click(screen.getByRole("button", { name: /change partner/i }));
    await userEvent.click(within(dialog()).getByText("Knight"));
    expect(onPartnerChange).toHaveBeenCalledWith("knight");
  });

  // A partner row on a game with no partner is an empty promise.
  it("offers no partner row for a game that has none", () => {
    setup({ gameId: "not_a_game" });
    expect(screen.queryByRole("button", { name: /partner/i })).toBeNull();
  });
});

describe("the badge case", () => {
  // The catalogue is a page of its own: the art at a size worth looking at,
  // everything in view at once, neither of which fits under a card editor.
  it("links out to the wall rather than unfolding one", () => {
    setup();
    expect(screen.queryByText("Spoiler")).toBeNull();
    // The game is already chosen in the editor, so the wall opens on it.
    expect(screen.getByRole("link", { name: /all badges/i })).toHaveAttribute(
      "href",
      "/me/badges?game=pokemon",
    );
  });
});
