// @vitest-environment node
// Pure logic: no DOM, so it skips the jsdom setup that dominates suite time.
import { describe, it, expect } from "vitest";
import { caseRows, leaguesFrom, type CaseScope } from "./badgeCase";
import { BADGES } from "./registry";
import type { EarnedBadge } from "./types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const SYSTEM: CaseScope = { kind: "system" };
const AT_WS: CaseScope = { kind: "league", workspaceId: WS };
const AT_OTHER: CaseScope = { kind: "league", workspaceId: OTHER_WS };

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
  {
    badgeId: "attendance",
    count: 4,
    workspaceId: OTHER_WS,
    workspaceName: "Red Dragon",
  },
  { badgeId: "champion", count: 2, workspaceId: null, gameId: "pokemon" },
];

const leagueBadges = BADGES.filter((b) => b.provenance === "league");
const systemBadges = BADGES.filter((b) => b.provenance !== "league");

const row = (rows: ReturnType<typeof caseRows>, id: string) =>
  rows.find((r) => r.badge.id === id);

describe("leaguesFrom", () => {
  // A player is not a member of the workspace they play at, so their clubs
  // are only knowable from the badges those events awarded.
  it("finds every club the player holds a badge at", () => {
    expect(leaguesFrom(held, "pokemon")).toEqual([
      { workspaceId: WS, name: "Bulwark" },
      { workspaceId: OTHER_WS, name: "Red Dragon" },
    ]);
  });

  it("ignores badges that belong to no club", () => {
    const systemOnly: EarnedBadge[] = [
      { badgeId: "champion", count: 1, workspaceId: null, gameId: "pokemon" },
    ];
    expect(leaguesFrom(systemOnly, "pokemon")).toEqual([]);
  });

  it("finds nothing for a player with no badges", () => {
    expect(leaguesFrom([], "pokemon")).toEqual([]);
  });

  it("lists each club once however many badges it awarded", () => {
    const twice: EarnedBadge[] = [
      { badgeId: "attendance", count: 3, workspaceId: WS, workspaceName: "Bulwark" },
      { badgeId: "attendance", count: 9, workspaceId: WS, workspaceName: "Bulwark" },
    ];
    expect(leaguesFrom(twice, "pokemon")).toHaveLength(1);
  });
});

describe("the Anywhere shelf", () => {
  it("lists the badges that belong to no club, and only those", () => {
    const rows = caseRows(held, "pokemon", SYSTEM);
    expect(rows).toHaveLength(systemBadges.length);
    expect(row(rows, "attendance")).toBeUndefined();
    expect(row(rows, "champion")).toBeDefined();
  });

  it("marks what is held and what is not", () => {
    const rows = caseRows(held, "pokemon", SYSTEM);
    expect(row(rows, "champion")?.held).toBe(true);
    expect(row(rows, "spoiler")?.held).toBe(false);
  });

  it("shows a held badge at the rung it has reached", () => {
    expect(row(caseRows(held, "pokemon", SYSTEM), "champion")?.label).toBe(
      "Two-Time",
    );
  });

  // A Champion of a chess evening says nothing about Pokémon.
  it("does not count a badge earned in another game as held", () => {
    expect(row(caseRows(held, "chess", SYSTEM), "champion")?.held).toBe(false);
  });

  it("has no next rung for an untiered badge", () => {
    expect(row(caseRows(held, "pokemon", SYSTEM), "spoiler")?.next).toBeNull();
  });
});

describe("a club's shelf", () => {
  it("lists the badges that carry a club's name, and only those", () => {
    const rows = caseRows(held, "pokemon", AT_WS);
    expect(rows).toHaveLength(leagueBadges.length);
    expect(row(rows, "attendance")).toBeDefined();
    expect(row(rows, "champion")).toBeUndefined();
  });

  // The whole point of the split: "Regular" means something different at each
  // club, and one flat list made the same badge look like three.
  it("counts each club separately", () => {
    expect(row(caseRows(held, "pokemon", AT_WS), "attendance")?.count).toBe(31);
    expect(row(caseRows(held, "pokemon", AT_OTHER), "attendance")?.count).toBe(4);
  });

  it("names the rung reached at that club", () => {
    expect(row(caseRows(held, "pokemon", AT_WS), "attendance")?.label).toBe(
      "Regular · Bulwark",
    );
    expect(row(caseRows(held, "pokemon", AT_OTHER), "attendance")?.label).toBe(
      "Attendee · Red Dragon",
    );
  });

  it("says how far to the next rung at that club", () => {
    // 31 events at Bulwark; Fixture is at 50.
    expect(row(caseRows(held, "pokemon", AT_WS), "attendance")?.next).toEqual(
      expect.objectContaining({ needed: 19 }),
    );
  });

  // Attendance is the same fact whichever night you turn up on.
  it("still counts a game-agnostic badge whatever is being played", () => {
    expect(row(caseRows(held, "chess", AT_WS), "attendance")?.held).toBe(true);
  });

  // An unheld row should read as the thing itself, not as its first rung.
  it("shows an unheld badge under its catalogue name", () => {
    const rows = caseRows([], "pokemon", AT_WS);
    expect(row(rows, "attendance")?.label).toBe("Attendance");
    expect(row(rows, "attendance")?.tier).toBeNull();
  });
});

describe("ordering", () => {
  it("puts held badges before the rest", () => {
    const rows = caseRows(held, "pokemon", SYSTEM);
    const lastHeld = rows.map((r) => r.held).lastIndexOf(true);
    const firstUnheld = rows.map((r) => r.held).indexOf(false);
    expect(lastHeld).toBeLessThan(firstUnheld);
  });

  // The next one to fall should be the next one you see, not buried under
  // things you have not started.
  it("orders unheld badges by how close they are", () => {
    const rows = caseRows([], "pokemon", SYSTEM).filter((r) => r.next !== null);
    const needed = rows.map((r) => r.next?.needed ?? 0);
    expect(needed).toEqual([...needed].sort((a, b) => a - b));
  });

  it("renders a shelf for a player with nothing at all", () => {
    const rows = caseRows([], "pokemon", SYSTEM);
    expect(rows).toHaveLength(systemBadges.length);
    expect(rows.every((r) => !r.held)).toBe(true);
  });
});
