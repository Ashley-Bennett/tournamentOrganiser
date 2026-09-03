import { describe, it, expect } from "vitest";
import { BADGES, TIERS, getBadge, isTiered } from "./registry";
import {
  badgesForGame,
  resolveBadge,
  sortForDisplay,
  tierFor,
  titleFor,
  toNextTier,
} from "./tiers";
import type { EarnedBadge } from "./types";

const attendance = getBadge("attendance")!;
const champion = getBadge("champion")!;
const spoiler = getBadge("spoiler")!;

describe("the registry", () => {
  it("has five rungs, and no copper", () => {
    expect(TIERS.map((t) => t.id)).toEqual([
      "white",
      "bronze",
      "silver",
      "gold",
      "diamond",
    ]);
  });

  // The shape is what makes a tier legible at 26px, so every rung needs its own.
  it("gives every rung a distinct shape", () => {
    const shapes = TIERS.map((t) => t.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("ships the five launch badges", () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      "attendance",
      "top_cut",
      "champion",
      "spoiler",
      "bubble",
    ]);
  });

  // A tiered badge needs exactly one threshold per rung, or a count could
  // resolve to a tier that has no shape to draw.
  it("gives every tiered badge one threshold per rung", () => {
    BADGES.filter(isTiered).forEach((b) => {
      expect(b.thresholds).toHaveLength(TIERS.length);
    });
  });

  it("keeps thresholds ascending", () => {
    BADGES.filter(isTiered).forEach((b) => {
      const sorted = [...b.thresholds].sort((x, y) => x - y);
      expect(b.thresholds).toEqual(sorted);
    });
  });

  // A climbing badge needs a title for every rung, or a player reaching gold
  // would silently drop back to the catalogue name.
  it("gives a climbing badge one title per rung", () => {
    BADGES.filter((b) => b.tierTitles).forEach((b) => {
      expect(b.tierTitles).toHaveLength(b.thresholds.length);
    });
  });

  it("keeps every worn title to two words, for chip width", () => {
    BADGES.forEach((b) => {
      [...(b.tierTitles ?? []), b.title].forEach((t) => {
        expect(t.split(/\s+/).length).toBeLessThanOrEqual(2);
      });
    });
  });

  it("keeps explanations to six words", () => {
    BADGES.forEach((b) => {
      expect(b.explanation.split(/\s+/).length).toBeLessThanOrEqual(6);
    });
  });
});

describe("tierFor", () => {
  it("is null before the first threshold", () => {
    expect(tierFor(attendance, 0)).toBeNull();
  });

  it("resolves each rung at its threshold", () => {
    expect(tierFor(attendance, 1)?.id).toBe("white");
    expect(tierFor(attendance, 5)?.id).toBe("bronze");
    expect(tierFor(attendance, 25)?.id).toBe("silver");
    expect(tierFor(attendance, 50)?.id).toBe("gold");
    expect(tierFor(attendance, 100)?.id).toBe("diamond");
  });

  it("holds the rung between thresholds", () => {
    expect(tierFor(attendance, 4)?.id).toBe("white");
    expect(tierFor(attendance, 24)?.id).toBe("bronze");
    expect(tierFor(attendance, 99)?.id).toBe("gold");
  });

  it("stays at the top rung beyond the last threshold", () => {
    expect(tierFor(attendance, 500)?.id).toBe("diamond");
  });

  it("is null for an untiered badge however high the count", () => {
    expect(tierFor(spoiler, 9)).toBeNull();
  });
});

describe("toNextTier", () => {
  it("counts the gap to the next rung", () => {
    expect(toNextTier(attendance, 0)).toEqual({
      needed: 1,
      tier: TIERS[0],
    });
    expect(toNextTier(attendance, 3)?.needed).toBe(2);
    expect(toNextTier(champion, 1)?.needed).toBe(1);
  });

  it("is null once the top rung is reached", () => {
    expect(toNextTier(attendance, 100)).toBeNull();
    expect(toNextTier(attendance, 250)).toBeNull();
  });

  it("is null for an untiered badge", () => {
    expect(toNextTier(spoiler, 1)).toBeNull();
  });
});

describe("titleFor", () => {
  it("climbs with the rung", () => {
    expect(titleFor(attendance, 1)).toBe("Attendee");
    expect(titleFor(attendance, 5)).toBe("Familiar Face");
    expect(titleFor(attendance, 25)).toBe("Regular");
    expect(titleFor(attendance, 50)).toBe("Fixture");
    expect(titleFor(attendance, 100)).toBe("Institution");
  });

  it("holds the title between thresholds", () => {
    expect(titleFor(attendance, 4)).toBe("Attendee");
    expect(titleFor(attendance, 99)).toBe("Fixture");
  });

  // A locked row in the badge case should read as the thing, not as its
  // first rung — nobody has "been" an Attendee before their first event.
  it("falls back to the catalogue name when unearned", () => {
    expect(titleFor(attendance, 0)).toBe("Attendance");
  });

  it("climbs for champion too", () => {
    expect(titleFor(champion, 1)).toBe("Champion");
    expect(titleFor(champion, 2)).toBe("Two-Time");
    expect(titleFor(champion, 3)).toBe("Hat Trick");
    expect(titleFor(champion, 5)).toBe("Dynasty");
    expect(titleFor(champion, 10)).toBe("Legend");
  });

  it("uses the one name for a badge that does not climb", () => {
    expect(titleFor(spoiler, 1)).toBe("Spoiler");
    expect(titleFor(spoiler, 0)).toBe("Spoiler");
  });
});

describe("resolveBadge", () => {
  it("attaches the league name to a per-league badge", () => {
    const r = resolveBadge({
      badgeId: "attendance",
      count: 12,
      workspaceId: "w1",
      workspaceName: "Bulwark",
    });
    expect(r?.label).toBe("Familiar Face · Bulwark");
    expect(r?.title).toBe("Familiar Face");
    expect(r?.tier?.id).toBe("bronze");
  });

  it("leaves a system badge unattributed", () => {
    const r = resolveBadge({ badgeId: "champion", count: 3 });
    expect(r?.label).toBe("Hat Trick");
  });

  // A per-league badge with no name resolved should not render a dangling
  // separator.
  it("omits the separator when the league name is missing", () => {
    const r = resolveBadge({ badgeId: "attendance", count: 1 });
    expect(r?.label).toBe("Attendee");
  });

  // A client that has not been redeployed will meet badges it does not know.
  // One unrecognised entry must not take the pairing board down.
  it("returns null for an unknown badge rather than throwing", () => {
    expect(resolveBadge({ badgeId: "not_shipped_yet", count: 1 })).toBeNull();
  });
});

describe("sortForDisplay", () => {
  const earned = (badgeId: string, count = 1): EarnedBadge => ({
    badgeId,
    count,
  });

  it("puts the rarest first, because the card only shows three", () => {
    const sorted = sortForDisplay([
      earned("attendance", 30),
      earned("spoiler"),
      earned("champion", 2),
    ]);
    expect(sorted.map((e) => e.badgeId)).toEqual([
      "spoiler",
      "champion",
      "attendance",
    ]);
  });

  it("breaks a tie on tier, then on count", () => {
    const sorted = sortForDisplay([
      earned("top_cut", 3),
      earned("attendance", 60),
    ]);
    // Both common; attendance is gold, top_cut is bronze.
    expect(sorted[0]?.badgeId).toBe("attendance");
  });

  it("sinks an unknown badge instead of dropping it", () => {
    const sorted = sortForDisplay([earned("mystery"), earned("spoiler")]);
    expect(sorted.map((e) => e.badgeId)).toEqual(["spoiler", "mystery"]);
  });

  it("does not mutate its input", () => {
    const input = [earned("attendance"), earned("spoiler")];
    sortForDisplay(input);
    expect(input.map((e) => e.badgeId)).toEqual(["attendance", "spoiler"]);
  });
});

describe("badgesForGame", () => {
  const earned = (
    badgeId: string,
    gameId: string | null = null,
  ): EarnedBadge => ({ badgeId, count: 1, gameId });

  // The point of the whole rule: a chess champion is not a Pokémon champion.
  it("hides a badge earned in another game", () => {
    const all = [earned("champion", "generic"), earned("champion", "pokemon")];
    expect(badgesForGame(all, "pokemon")).toEqual([
      earned("champion", "pokemon"),
    ]);
  });

  // Attendance describes the club, not the play, so it travels.
  it("keeps a game-agnostic badge whatever is being played", () => {
    const all = [earned("attendance")];
    expect(badgesForGame(all, "pokemon")).toHaveLength(1);
    expect(badgesForGame(all, "generic")).toHaveLength(1);
  });

  it("shows everything when there is no game in context", () => {
    const all = [earned("champion", "generic"), earned("attendance")];
    expect(badgesForGame(all, null)).toHaveLength(2);
  });

  // A per-game badge whose game never arrived is not safe to show.
  it("hides a per-game badge with no game recorded", () => {
    expect(badgesForGame([earned("champion", null)], "pokemon")).toEqual([]);
  });

  it("drops an unknown badge rather than guessing", () => {
    expect(badgesForGame([earned("mystery", "pokemon")], "pokemon")).toEqual([]);
  });
});

describe("the registry, game scoping", () => {
  it("scopes performance badges to a game and attendance to none", () => {
    expect(getBadge("attendance")!.perGame).toBe(false);
    ["top_cut", "champion", "spoiler", "bubble"].forEach((id) => {
      expect(getBadge(id)!.perGame).toBe(true);
    });
  });
});
