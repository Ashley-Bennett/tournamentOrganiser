import type { BadgeDefinition, Tier, TierId } from "./types";

/**
 * The badges registry — the single place a badge is added.
 *
 * Adding one should mean adding an entry here. Nothing outside this directory
 * should branch on a badge id.
 *
 * NOT YET ENABLED. Nothing renders these; the module exists so the data model
 * and the tier maths can be built and tested ahead of any UI.
 */

/**
 * The tier ladder, low to high. Shape carries the tier as much as colour does,
 * so a rung is legible at 26px across a room.
 *
 * The progression reads blank → cut → pointed → radiant → gem, which people
 * rank correctly without being taught it. Star sits below rhombus on purpose:
 * a star is a rank, a gem is a treasure.
 */
export const TIERS: Tier[] = [
  { id: "white", label: "White", shape: "circle", hex: "#EDF0F5" },
  { id: "bronze", label: "Bronze", shape: "hexagon", hex: "#A9784A" },
  { id: "silver", label: "Silver", shape: "shield", hex: "#C3C9D2" },
  { id: "gold", label: "Gold", shape: "star", hex: "#D9AC3F" },
  { id: "diamond", label: "Diamond", shape: "rhombus", hex: "#8FD3DA" },
];

export const BADGES: BadgeDefinition[] = [
  {
    id: "attendance",
    title: "Attendance",
    tierTitles: [
      "Attendee",
      "Familiar Face",
      "Regular",
      "Fixture",
      "Institution",
    ],
    explanation: "Events finished here",
    provenance: "league",
    rarity: "common",
    metric: "events_at_league",
    thresholds: [1, 5, 25, 50, 100],
    perLeague: true,
  },
  {
    id: "top_cut",
    title: "Top Cut",
    explanation: "Top eight in a tournament",
    provenance: "system",
    rarity: "common",
    metric: "top_cuts",
    thresholds: [1, 3, 10, 25, 50],
    // A cut has to exclude somebody. Below sixteen players the top four is the
    // cut, which the RPC applies; this is the floor for counting at all.
    minFieldSize: 8,
    perLeague: false,
  },
  {
    id: "champion",
    title: "Champion",
    tierTitles: ["Champion", "Two-Time", "Hat Trick", "Dynasty", "Legend"],
    explanation: "First place in a tournament",
    provenance: "system",
    rarity: "rare",
    metric: "event_wins",
    thresholds: [1, 2, 3, 5, 10],
    // Winning a three-person kitchen-table event is not the same achievement.
    minFieldSize: 8,
    perLeague: false,
  },
  {
    id: "spoiler",
    title: "Spoiler",
    explanation: "The winner's only loss",
    provenance: "system",
    rarity: "mythic",
    metric: "none",
    thresholds: [],
    minFieldSize: 8,
    perLeague: false,
  },
  {
    id: "bubble",
    title: "Bubble",
    explanation: "One place below the cut",
    provenance: "system",
    rarity: "uncommon",
    metric: "none",
    thresholds: [],
    minFieldSize: 8,
    perLeague: false,
  },
];

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export function getBadge(id: string): BadgeDefinition | undefined {
  return BY_ID.get(id);
}

export function getTier(id: TierId): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}

/** True when the badge counts up rather than being earned once. */
export function isTiered(badge: BadgeDefinition): boolean {
  return badge.thresholds.length > 0;
}
