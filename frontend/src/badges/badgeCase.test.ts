// @vitest-environment node
// Pure logic: no DOM, so it skips the jsdom setup that dominates suite time.
import { describe, it, expect } from "vitest";
import { caseRows } from "./badgeCase";
import { BADGES } from "./registry";
import type { EarnedBadge } from "./types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";
const OTHER_WS = "11111111-2222-3333-4444-555555555555";

const held: EarnedBadge[] = [
  { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
  { badgeId: "champion", count: 2, workspaceId: null, gameId: "pokemon" },
];

const row = (rows: ReturnType<typeof caseRows>, id: string) =>
  rows.find((r) => r.badge.id === id);

describe("caseRows", () => {
  // The case is the answer to "what else is there", so nothing is left out.
  it("lists every badge in the catalogue", () => {
    expect(caseRows(held, "pokemon")).toHaveLength(BADGES.length);
  });

  it("marks what is held and what is not", () => {
    const rows = caseRows(held, "pokemon");
    expect(row(rows, "attendance")?.held).toBe(true);
    expect(row(rows, "spoiler")?.held).toBe(false);
  });

  it("shows a held badge at the rung it has reached", () => {
    const rows = caseRows(held, "pokemon");
    expect(row(rows, "attendance")?.label).toBe("Regular · Bulwark");
    expect(row(rows, "attendance")?.count).toBe(31);
  });

  // An unheld row should read as the thing itself, not as its first rung —
  // "Attendance", not "Attendee".
  it("shows an unheld badge under its catalogue name", () => {
    const rows = caseRows([], "pokemon");
    expect(row(rows, "attendance")?.label).toBe("Attendance");
    expect(row(rows, "attendance")?.tier).toBeNull();
  });

  // "Do I have this, and how far along" is one question, and three Regular
  // rows at three clubs answers it three times over.
  it("collapses a badge held at several leagues to its best", () => {
    const many: EarnedBadge[] = [
      { badgeId: "attendance", count: 4, workspaceId: OTHER_WS, workspaceName: "Red Dragon" },
      { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
    ];
    const rows = caseRows(many, "pokemon");
    expect(rows.filter((r) => r.badge.id === "attendance")).toHaveLength(1);
    expect(row(rows, "attendance")?.workspaceName).toBe("Bulwark");
  });

  it("puts held badges before the rest", () => {
    const rows = caseRows(held, "pokemon");
    const lastHeld = rows.map((r) => r.held).lastIndexOf(true);
    const firstUnheld = rows.map((r) => r.held).indexOf(false);
    expect(lastHeld).toBeLessThan(firstUnheld);
  });

  // The next one to fall should be the next one you see, not buried under
  // things you have not started.
  it("orders unheld badges by how close they are", () => {
    const rows = caseRows([], "pokemon").filter((r) => r.next !== null);
    const needed = rows.map((r) => r.next?.needed ?? 0);
    expect(needed).toEqual([...needed].sort((a, b) => a - b));
  });

  it("says how far to the next rung on a held badge", () => {
    const rows = caseRows(held, "pokemon");
    // 31 events; Fixture is at 50.
    expect(row(rows, "attendance")?.next).toEqual(
      expect.objectContaining({ needed: 19 }),
    );
  });

  it("has no next rung for an untiered badge", () => {
    expect(row(caseRows(held, "pokemon"), "spoiler")?.next).toBeNull();
  });

  // A Champion of a chess evening says nothing about Pokémon, so the row is
  // there but unheld rather than showing somebody else's game's record.
  it("does not count a badge earned in another game as held", () => {
    expect(row(caseRows(held, "chess"), "champion")?.held).toBe(false);
  });

  it("still counts a game-agnostic badge whatever is being played", () => {
    expect(row(caseRows(held, "chess"), "attendance")?.held).toBe(true);
  });

  it("renders a catalogue for a player with nothing at all", () => {
    const rows = caseRows([], "pokemon");
    expect(rows).toHaveLength(BADGES.length);
    expect(rows.every((r) => !r.held)).toBe(true);
  });
});
