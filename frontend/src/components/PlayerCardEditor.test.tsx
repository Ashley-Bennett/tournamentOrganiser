import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlayerCardEditor from "./PlayerCardEditor";
import type { EquippedSlot } from "../badges/card";
import type { EarnedBadge } from "../badges/types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
  { badgeId: "champion", count: 2, workspaceId: null, workspaceName: null },
];

const equipped: EquippedSlot[] = [
  { slot: 0, badgeId: "attendance", workspaceId: WS },
  { slot: 1, badgeId: "champion", workspaceId: null },
];

function setup(over: Partial<Parameters<typeof PlayerCardEditor>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <PlayerCardEditor
      name="Marcus Hale"
      gameId="pokemon"
      partnerKey="25"
      equipped={equipped}
      earned={held}
      onChange={onChange}
      {...over}
    />,
  );
  return { onChange };
}

describe("PlayerCardEditor", () => {
  // The preview is the real component at the real density. A player choosing
  // what a room will see should not have to guess whether the thing they are
  // editing is the thing that gets shown.
  it("previews the card it is editing", () => {
    setup();
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
    expect(screen.getAllByText("Regular · Bulwark").length).toBeGreaterThan(0);
  });

  it("hands back the loadout without the slot that was taken off", async () => {
    const { onChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /take off regular/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      { slot: 1, badgeId: "champion", workspaceId: null },
    ]);
  });

  it("leaves the other slots alone when one is cleared", async () => {
    const { onChange } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /take off two-time/i }),
    );
    expect(onChange).toHaveBeenCalledWith([
      { slot: 0, badgeId: "attendance", workspaceId: WS },
    ]);
  });

  // Quiet on purpose, and with no picker they are not controls: a row of
  // buttons that do nothing is worse than a row of placeholders.
  it("draws empty slots as placeholders when there is no picker", () => {
    setup({ equipped: [] });
    expect(screen.queryByRole("button", { name: /choose a title/i })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("makes empty slots pickable once a picker is given", async () => {
    const onPickSlot = vi.fn();
    setup({ equipped: [], onPickSlot });

    await userEvent.click(screen.getByRole("button", { name: /choose a title/i }));
    expect(onPickSlot).toHaveBeenCalledWith(0);

    await userEvent.click(
      screen.getByRole("button", { name: /choose a badge for slot 3/i }),
    );
    expect(onPickSlot).toHaveBeenCalledWith(3);
  });

  it("offers exactly three badge slots", () => {
    const onPickSlot = vi.fn();
    setup({ equipped: [], onPickSlot });
    expect(
      screen.getAllByRole("button", { name: /choose a badge for slot/i }),
    ).toHaveLength(3);
  });

  // A badge can stop being held. The slot row outliving it must not draw.
  it("shows a slot as empty when its badge is no longer held", () => {
    const onPickSlot = vi.fn();
    setup({
      equipped: [{ slot: 0, badgeId: "attendance", workspaceId: WS }],
      earned: [],
      onPickSlot,
    });
    expect(
      screen.getByRole("button", { name: /choose a title/i }),
    ).toBeInTheDocument();
  });

  it("renders a card with nothing equipped at all", () => {
    setup({ equipped: [] });
    expect(screen.getByText("Marcus Hale")).toBeInTheDocument();
  });
});
