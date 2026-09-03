import { describe, it, expect } from "vitest";
import { getBadge } from "./registry";
import {
  assembleCard,
  canEquip,
  equippableBadges,
  firstEarnedAt,
  isBareCard,
  lastEarnedAt,
  tierReachedAt,
  type CardSlot,
} from "./card";
import type { EarnedBadge } from "./types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const slot = (over: Partial<CardSlot> = {}): CardSlot => ({
  slot: 1,
  badgeId: "top_cut",
  workspaceId: null,
  workspaceName: null,
  count: 4,
  ...over,
});

const earned = (over: Partial<EarnedBadge> = {}): EarnedBadge => ({
  badgeId: "top_cut",
  count: 4,
  gameId: "pokemon",
  ...over,
});

describe("assembleCard", () => {
  it("puts slot 0 in the title and the rest in badges", () => {
    const card = assembleCard({
      gameId: "pokemon",
      partnerKey: "25",
      slots: [
        slot({ slot: 0, badgeId: "attendance", count: 8, workspaceId: WS, workspaceName: "Bulwark" }),
        slot({ slot: 1, badgeId: "top_cut", count: 4 }),
        slot({ slot: 2, badgeId: "champion", count: 2 }),
      ],
    });

    expect(card.title?.label).toBe("Familiar Face · Bulwark");
    expect(card.badges.map((b) => b.badge.id)).toEqual(["top_cut", "champion"]);
    expect(card.partnerImage).toContain("/25.png");
  });

  it("orders badges by slot regardless of input order", () => {
    const card = assembleCard({
      gameId: "pokemon",
      partnerKey: null,
      slots: [
        slot({ slot: 3, badgeId: "champion", count: 1 }),
        slot({ slot: 1, badgeId: "top_cut", count: 4 }),
      ],
    });
    expect(card.badges.map((b) => b.badge.id)).toEqual(["top_cut", "champion"]);
  });

  it("never draws more than three badges", () => {
    const card = assembleCard({
      gameId: "pokemon",
      partnerKey: null,
      slots: [1, 2, 3, 4, 5].map((n) => slot({ slot: n })),
    });
    expect(card.badges).toHaveLength(3);
  });

  // The card is chrome around somebody's name in a room full of people. A
  // badge that no longer resolves is dropped; the name still renders.
  it("drops an unknown badge rather than failing", () => {
    const card = assembleCard({
      gameId: "pokemon",
      partnerKey: null,
      slots: [slot({ slot: 1, badgeId: "not_shipped_yet" })],
    });
    expect(card.badges).toEqual([]);
  });

  // A slot can outlive the history behind it — an event deleted, a merge
  // undone. Showing it at zero would be a lie.
  it("drops a slot whose count has fallen to nothing", () => {
    const card = assembleCard({
      gameId: "pokemon",
      partnerKey: null,
      slots: [
        slot({ slot: 0, badgeId: "champion", count: 0 }),
        slot({ slot: 1, badgeId: "top_cut", count: 0 }),
      ],
    });
    expect(card.title).toBeNull();
    expect(card.badges).toEqual([]);
  });

  it("falls back to the game's default partner when none is chosen", () => {
    const card = assembleCard({ gameId: "pokemon", partnerKey: null, slots: [] });
    expect(card.partnerImage).toContain("/132.png");
  });

  it("has no partner for a game that does not have them", () => {
    const card = assembleCard({ gameId: null, partnerKey: null, slots: [] });
    expect(card.partnerImage).toBeNull();
  });

  it("reports a card with nothing equipped as bare", () => {
    const bare = assembleCard({ gameId: "pokemon", partnerKey: "25", slots: [] });
    expect(isBareCard(bare)).toBe(true);

    const worn = assembleCard({
      gameId: "pokemon",
      partnerKey: "25",
      slots: [slot({ slot: 0 })],
    });
    expect(isBareCard(worn)).toBe(false);
  });
});

describe("equippableBadges", () => {
  it("offers only badges earned in the game being played", () => {
    const all = [
      earned({ badgeId: "champion", count: 1, gameId: "generic" }),
      earned({ badgeId: "top_cut", count: 4, gameId: "pokemon" }),
    ];
    expect(equippableBadges(all, "pokemon").map((e) => e.badgeId)).toEqual([
      "top_cut",
    ]);
  });

  it("offers a game-agnostic badge whatever is being played", () => {
    const all = [earned({ badgeId: "attendance", count: 3, gameId: null, workspaceId: WS })];
    expect(equippableBadges(all, "pokemon")).toHaveLength(1);
    expect(equippableBadges(all, "generic")).toHaveLength(1);
  });

  // Below the first threshold the badge has not been earned, whatever the row
  // says — the picker must not offer something the card would then refuse.
  it("withholds a tiered badge below its first rung", () => {
    const all = [earned({ badgeId: "champion", count: 0, gameId: "pokemon" })];
    expect(equippableBadges(all, "pokemon")).toEqual([]);
  });

  it("withholds a badge the registry does not know", () => {
    const all = [earned({ badgeId: "mystery", count: 5 })];
    expect(equippableBadges(all, "pokemon")).toEqual([]);
  });
});

describe("canEquip", () => {
  const all = [
    earned({ badgeId: "attendance", count: 8, gameId: null, workspaceId: WS }),
    earned({ badgeId: "top_cut", count: 4, gameId: "pokemon" }),
  ];

  it("allows what has been earned", () => {
    expect(canEquip(all, "pokemon", "top_cut")).toBe(true);
    expect(canEquip(all, "pokemon", "attendance", WS)).toBe(true);
  });

  it("refuses what has not", () => {
    expect(canEquip(all, "pokemon", "spoiler")).toBe(false);
  });

  // You can be a Regular at two clubs, so the league has to match — equipping
  // Bulwark's attendance is not the same as equipping Red Dragon's.
  it("refuses the right badge at the wrong league", () => {
    expect(canEquip(all, "pokemon", "attendance", "some-other-workspace")).toBe(
      false,
    );
  });

  it("refuses a badge earned in another game", () => {
    expect(canEquip(all, "generic", "top_cut")).toBe(false);
  });
});

describe("tierReachedAt", () => {
  const attendance = getBadge("attendance")!;
  // Thresholds 1, 5, 25, 50, 100.
  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  );

  it("reads the date the current rung was reached", () => {
    // 8 events is bronze, which starts at the 5th.
    const at = tierReachedAt(attendance, {
      badgeId: "attendance",
      count: 8,
      earnedAt: dates,
    });
    expect(at).toBe(dates[4]);
  });

  it("reads the top rung's date once it is reached", () => {
    // 25 events is silver, the third rung.
    const at = tierReachedAt(attendance, {
      badgeId: "attendance",
      count: 25,
      earnedAt: dates,
    });
    expect(at).toBe(dates[24]);
  });

  // Dates are capped in the database, so a long-standing regular may have a
  // rung whose date was trimmed away. Guessing would be worse than admitting.
  it("returns null rather than guessing when the date was capped away", () => {
    const at = tierReachedAt(attendance, {
      badgeId: "attendance",
      count: 60,
      earnedAt: dates.slice(0, 10),
    });
    expect(at).toBeNull();
  });

  it("returns null when no dates were stored at all", () => {
    expect(tierReachedAt(attendance, { badgeId: "attendance", count: 8 })).toBeNull();
  });
});

describe("first and last earned", () => {
  const dates = ["2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"];

  it("reads both ends of the run", () => {
    const e = earned({ earnedAt: dates });
    expect(firstEarnedAt(e)).toBe(dates[0]);
    expect(lastEarnedAt(e)).toBe(dates[1]);
  });

  it("is null when nothing was stored", () => {
    expect(firstEarnedAt(earned())).toBeNull();
    expect(lastEarnedAt(earned())).toBeNull();
  });
});
