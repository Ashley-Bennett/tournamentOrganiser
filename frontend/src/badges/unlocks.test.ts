// @vitest-environment node
// Pure logic: no DOM, so it skips the jsdom setup that dominates suite time.
import { describe, it, expect } from "vitest";
import {
  snapshotKey,
  snapshotOf,
  unlockMessage,
  unlocksBetween,
  type BadgeSnapshot,
} from "./unlocks";
import type { EarnedBadge } from "./types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const attendance = (count: number, workspaceId = WS): EarnedBadge => ({
  badgeId: "attendance",
  count,
  workspaceId,
  workspaceName: workspaceId === WS ? "Bulwark" : "Red Dragon",
});

const champion = (count: number): EarnedBadge => ({
  badgeId: "champion",
  count,
  workspaceId: null,
  gameId: "pokemon",
});

describe("snapshotOf", () => {
  // Attendance at two clubs is two things, and a top cut in chess is not a top
  // cut in Pokémon.
  it("keys on the league and the game as well as the badge", () => {
    const snap = snapshotOf([attendance(8), attendance(3, OTHER_WS)]);
    expect(Object.keys(snap)).toHaveLength(2);
    expect(snap[snapshotKey(attendance(8))]).toBe(8);
  });

  it("is empty for a player with nothing", () => {
    expect(snapshotOf([])).toEqual({});
  });
});

describe("unlocksBetween", () => {
  it("reports a badge that was not held before", () => {
    const out = unlocksBetween({}, [champion(1)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("earned");
    expect(out[0].label).toBe("Champion");
  });

  // The case the server cannot see: the count was already there, the rung
  // is what changed.
  it("reports a promotion onto a new rung", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(8))]: 8 };
    const out = unlocksBetween(before, [attendance(25)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("promoted");
    expect(out[0].label).toBe("Regular · Bulwark");
  });

  // Turning up to your sixth event when Regular is at 25 has not changed
  // anything worth interrupting somebody for.
  it("says nothing when the count rises inside a rung", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(6))]: 6 };
    expect(unlocksBetween(before, [attendance(7)])).toEqual([]);
  });

  it("says nothing when nothing has changed", () => {
    const held = [attendance(8), champion(2)];
    expect(unlocksBetween(snapshotOf(held), held)).toEqual([]);
  });

  // An event deleted or a merge undone. Telling somebody they have lost a
  // badge is a notification nobody needs and cannot act on.
  it("says nothing when a count goes down", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(30))]: 30 };
    expect(unlocksBetween(before, [attendance(4)])).toEqual([]);
  });

  it("reports each league separately", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(8))]: 8 };
    const out = unlocksBetween(before, [attendance(8), attendance(1, OTHER_WS)]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Attendee · Red Dragon");
  });

  it("crosses several rungs at once as one promotion", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(1))]: 1 };
    const out = unlocksBetween(before, [attendance(60)]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Fixture · Bulwark");
  });

  // A badge whose first rung is only reached now has nothing to be promoted
  // from, so it reads as newly earned.
  it("calls reaching the first rung an earning, not a promotion", () => {
    const zero: BadgeSnapshot = { [snapshotKey(attendance(0))]: 0 };
    const out = unlocksBetween(zero, [attendance(2)]);
    expect(out[0]?.kind).toBe("earned");
  });

  it("ignores a badge the registry has never heard of", () => {
    const stranger: EarnedBadge = { badgeId: "not_shipped_yet", count: 3 };
    expect(unlocksBetween({}, [stranger])).toEqual([]);
  });

  it("ignores a badge with nothing behind it", () => {
    expect(unlocksBetween({}, [attendance(0)])).toEqual([]);
  });

  it("reports several unlocks from one pass", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(8))]: 8 };
    const out = unlocksBetween(before, [attendance(25), champion(1)]);
    expect(out.map((u) => u.kind).sort()).toEqual(["earned", "promoted"]);
  });
});

describe("unlockMessage", () => {
  it("reads as an earning", () => {
    const out = unlocksBetween({}, [champion(1)]);
    expect(unlockMessage(out[0])).toBe("You earned Champion");
  });

  it("reads as a promotion, with the league", () => {
    const before: BadgeSnapshot = { [snapshotKey(attendance(8))]: 8 };
    const out = unlocksBetween(before, [attendance(25)]);
    expect(unlockMessage(out[0])).toBe("You are now Regular · Bulwark");
  });

  // "You are now Top Cut" would announce something they already were.
  it("names the rung for a badge whose title does not climb", () => {
    const topCut = (count: number): EarnedBadge => ({
      badgeId: "top_cut",
      count,
      workspaceId: null,
      gameId: "pokemon",
    });
    const before: BadgeSnapshot = { [snapshotKey(topCut(2))]: 2 };
    const out = unlocksBetween(before, [topCut(3)]);
    expect(unlockMessage(out[0])).toBe("Your Top Cut reached Bronze");
  });
});
