import type { BadgeDefinition, Tier, TierId } from "./types";

/**
 * The badges registry — the single place a badge is added.
 *
 * Adding one should mean adding an entry here. Nothing outside this directory
 * should branch on a badge id.
 */

/**
 * The tier ladder, low to high. Each rung is an outline colour and a glow that
 * grows as you climb — white has no glow at all, so the glow itself is what
 * you earn, and it separates the pale rungs when their colours look alike.
 */
export const TIERS: Tier[] = [
  { id: "white", label: "White", hex: "#EDF0F5", glow: 0 },
  { id: "bronze", label: "Bronze", hex: "#A9784A", glow: 0.5 },
  { id: "silver", label: "Silver", hex: "#C3C9D2", glow: 0.8 },
  { id: "gold", label: "Gold", hex: "#D9AC3F", glow: 1 },
  { id: "diamond", label: "Diamond", hex: "#8FD3DA", glow: 1.4 },
];

/**
 * The colour of a badge with no tier. Purple, because no rung is anywhere
 * near it — a grey-blue here read as one more pale rung beside white and
 * silver, which is exactly what an untiered badge is not.
 */
export const UNTIERED_HEX = "#A77BFF";

/** Untiered badges glow at full strength; they are the rare ones. */
export const UNTIERED_GLOW = 1;

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
    countedExplanation: "{n} event{s} finished here",
    provenance: "league",
    rarity: "common",
    metric: "events_at_league",
    thresholds: [1, 5, 25, 50, 100],
    perLeague: true,
    perGame: false,
    artSrc: "/badges/attendance.png",
  },
  {
    id: "top_cut",
    title: "Top Cut",
    explanation: "Top eight in a tournament",
    countedExplanation: "{n} top-eight finish{es}",
    provenance: "system",
    rarity: "common",
    metric: "top_cuts",
    thresholds: [1, 3, 10, 25, 50],
    // A cut has to exclude somebody. Below sixteen players the top four is the
    // cut, which the RPC applies; this is the floor for counting at all.
    minFieldSize: 8,
    perLeague: false,
    perGame: true,
    artSrc: "/badges/top_cut.png",
  },
  {
    id: "champion",
    title: "Champion",
    tierTitles: ["Champion", "Two-Time", "Hat Trick", "Dynasty", "Legend"],
    explanation: "First place in a tournament",
    countedExplanation: "{n} tournament win{s}",
    provenance: "system",
    rarity: "rare",
    metric: "event_wins",
    thresholds: [1, 2, 3, 5, 10],
    // Winning a three-person kitchen-table event is not the same achievement.
    minFieldSize: 8,
    perLeague: false,
    perGame: true,
    artSrc: "/badges/champion.png",
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
    perGame: true,
    artSrc: "/badges/spoiler.png",
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
    perGame: true,
    artSrc: "/badges/bubble.png",
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
