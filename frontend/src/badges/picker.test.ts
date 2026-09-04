// @vitest-environment node
// Pure logic: no DOM, so it skips the jsdom setup that dominates suite time.
import { describe, it, expect } from "vitest";
import { badgeKey, equipInSlot, parseBadgeKey, slotOptions } from "./picker";
import type { EquippedSlot } from "./card";
import type { EarnedBadge } from "./types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
  {
    badgeId: "attendance",
    count: 9,
    workspaceId: OTHER_WS,
    workspaceName: "Red Dragon",
  },
  { badgeId: "champion", count: 2, workspaceId: null, gameId: "pokemon" },
  { badgeId: "top_cut", count: 12, workspaceId: null, gameId: "pokemon" },
];

const keys = (opts: { key: string }[]) => opts.map((o) => o.key);

describe("badgeKey", () => {
  // Regular at two clubs is two different things to wear, and a list keyed on
  // the badge id alone would silently collapse them into one.
  it("distinguishes the same badge at different leagues", () => {
    expect(badgeKey("attendance", WS)).not.toBe(badgeKey("attendance", OTHER_WS));
  });

  it("round-trips a key with a league", () => {
    expect(parseBadgeKey(badgeKey("attendance", WS))).toEqual({
      badgeId: "attendance",
      workspaceId: WS,
    });
  });

  it("round-trips a key with no league", () => {
    expect(parseBadgeKey(badgeKey("champion", null))).toEqual({
      badgeId: "champion",
      workspaceId: null,
    });
  });

  it("treats a key with no separator as a bare badge id", () => {
    expect(parseBadgeKey("champion")).toEqual({
      badgeId: "champion",
      workspaceId: null,
    });
  });
});

describe("slotOptions", () => {
  it("offers each league's copy of a badge separately", () => {
    const opts = slotOptions(held, "pokemon", [], 0);
    expect(opts.filter((o) => o.badgeId === "attendance")).toHaveLength(2);
  });

  it("labels each with the league it was earned at", () => {
    const opts = slotOptions(held, "pokemon", [], 0);
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("Regular · Bulwark");
    expect(labels).toContain("Familiar Face · Red Dragon");
  });

  // The same mark twice in the badge row is not a loadout, it is a mistake.
  it("leaves out a badge worn in another icon slot", () => {
    const equipped: EquippedSlot[] = [
      { slot: 1, badgeId: "champion", workspaceId: null },
    ];
    expect(keys(slotOptions(held, "pokemon", equipped, 2))).not.toContain(
      badgeKey("champion", null),
    );
  });

  // Wearing a badge as your title and also showing it is not a duplicate:
  // one is a claim in words, the other is the artwork.
  it("still offers a badge worn as the title for an icon slot", () => {
    const equipped: EquippedSlot[] = [
      { slot: 0, badgeId: "champion", workspaceId: null },
    ];
    expect(keys(slotOptions(held, "pokemon", equipped, 1))).toContain(
      badgeKey("champion", null),
    );
  });

  it("still offers a badge worn as an icon for the title", () => {
    const equipped: EquippedSlot[] = [
      { slot: 2, badgeId: "champion", workspaceId: null },
    ];
    expect(keys(slotOptions(held, "pokemon", equipped, 0))).toContain(
      badgeKey("champion", null),
    );
  });

  // Opening a filled slot must show what is in it, not a list that
  // mysteriously omits the thing being looked at.
  it("keeps the badge that is in the slot being filled", () => {
    const equipped: EquippedSlot[] = [
      { slot: 1, badgeId: "champion", workspaceId: null },
    ];
    expect(keys(slotOptions(held, "pokemon", equipped, 1))).toContain(
      badgeKey("champion", null),
    );
  });

  // A Champion of a chess evening says nothing about Pokémon.
  it("hides a badge earned in another game", () => {
    expect(keys(slotOptions(held, "chess", [], 0))).not.toContain(
      badgeKey("champion", null),
    );
  });

  // Attendance is the same fact whichever night you turn up on.
  it("keeps a game-agnostic badge whatever is being played", () => {
    expect(keys(slotOptions(held, "chess", [], 0))).toContain(
      badgeKey("attendance", WS),
    );
  });

  it("carries the resolved rung and count", () => {
    const opt = slotOptions(held, "pokemon", [], 0).find(
      (o) => o.key === badgeKey("attendance", WS),
    );
    expect(opt?.count).toBe(31);
    expect(opt?.tier?.id).toBe("silver");
  });

  it("returns nothing for a player with no badges", () => {
    expect(slotOptions([], "pokemon", [], 0)).toEqual([]);
  });

  // Every tiered badge in the catalogue starts at 1 today, so a count of zero
  // is the only way to hold a badge without having earned it — a slot row that
  // outlived the history behind it.
  it("does not offer a badge with nothing behind it", () => {
    const nothing: EarnedBadge[] = [
      { badgeId: "attendance", count: 0, workspaceId: WS },
    ];
    expect(slotOptions(nothing, "pokemon", [], 0)).toEqual([]);
  });

  it("offers a badge sitting on its first rung", () => {
    const one: EarnedBadge[] = [
      { badgeId: "attendance", count: 1, workspaceId: WS },
    ];
    expect(slotOptions(one, "pokemon", [], 0)[0]?.title).toBe("Attendee");
  });
});

describe("equipInSlot", () => {
  it("fills an empty slot", () => {
    expect(
      equipInSlot([], 2, { badgeId: "champion", workspaceId: null }),
    ).toEqual([{ slot: 2, badgeId: "champion", workspaceId: null }]);
  });

  it("replaces what was in the slot, leaving the others alone", () => {
    const equipped: EquippedSlot[] = [
      { slot: 0, badgeId: "attendance", workspaceId: WS },
      { slot: 1, badgeId: "champion", workspaceId: null },
    ];
    expect(
      equipInSlot(equipped, 1, { badgeId: "top_cut", workspaceId: null }),
    ).toEqual([
      { slot: 0, badgeId: "attendance", workspaceId: WS },
      { slot: 1, badgeId: "top_cut", workspaceId: null },
    ]);
  });

  it("leaves the title alone when the same badge goes in an icon slot", () => {
    const equipped: EquippedSlot[] = [
      { slot: 0, badgeId: "champion", workspaceId: null },
    ];
    expect(
      equipInSlot(equipped, 1, { badgeId: "champion", workspaceId: null }),
    ).toEqual([
      { slot: 0, badgeId: "champion", workspaceId: null },
      { slot: 1, badgeId: "champion", workspaceId: null },
    ]);
  });

  it("leaves an icon alone when the same badge becomes the title", () => {
    const equipped: EquippedSlot[] = [
      { slot: 1, badgeId: "champion", workspaceId: null },
    ];
    expect(
      equipInSlot(equipped, 0, { badgeId: "champion", workspaceId: null }),
    ).toEqual([
      { slot: 0, badgeId: "champion", workspaceId: null },
      { slot: 1, badgeId: "champion", workspaceId: null },
    ]);
  });

  // The picker does not offer a badge worn in another icon slot, so this is a
  // guard rather than a path: nothing should produce a duplicate icon.
  it("moves a badge between icon slots rather than copying it", () => {
    const equipped: EquippedSlot[] = [
      { slot: 1, badgeId: "champion", workspaceId: null },
    ];
    expect(
      equipInSlot(equipped, 3, { badgeId: "champion", workspaceId: null }),
    ).toEqual([{ slot: 3, badgeId: "champion", workspaceId: null }]);
  });

  it("treats the same badge at another league as a different badge", () => {
    const equipped: EquippedSlot[] = [
      { slot: 1, badgeId: "attendance", workspaceId: WS },
    ];
    expect(
      equipInSlot(equipped, 2, { badgeId: "attendance", workspaceId: OTHER_WS }),
    ).toEqual([
      { slot: 1, badgeId: "attendance", workspaceId: WS },
      { slot: 2, badgeId: "attendance", workspaceId: OTHER_WS },
    ]);
  });

  it("keeps the loadout in slot order", () => {
    const equipped: EquippedSlot[] = [
      { slot: 3, badgeId: "top_cut", workspaceId: null },
    ];
    const next = equipInSlot(equipped, 0, {
      badgeId: "attendance",
      workspaceId: WS,
    });
    expect(next.map((s) => s.slot)).toEqual([0, 3]);
  });
});
