// Scoring schemes and the default window for the organiser league table.
//
// A league runs over a handful of recent events, so the default is a rolling
// six-week window rather than "all time" — a season table that never resets
// stops being a league and becomes a lifetime leaderboard.

export interface PlacementScheme {
  id: string;
  name: string;
  hint: string;
  /** Points by finishing position: index 0 is 1st place. Empty means none. */
  points: number[];
}

export const PLACEMENT_SCHEMES: PlacementScheme[] = [
  {
    id: "standard",
    name: "Standard",
    hint: "10-8-6-5-4-3-2-1 down to 8th",
    points: [10, 8, 6, 5, 4, 3, 2, 1],
  },
  {
    id: "podium",
    name: "Podium",
    hint: "5-3-1, top three only",
    points: [5, 3, 1],
  },
  {
    id: "winner",
    name: "Winner takes all",
    hint: "3 points for winning the event",
    points: [3],
  },
  {
    id: "none",
    name: "Match points only",
    hint: "No bonus for finishing position",
    points: [],
  },
];

export const DEFAULT_SCHEME_ID = "standard";

export function schemeById(id: string): PlacementScheme {
  return PLACEMENT_SCHEMES.find((s) => s.id === id) ?? PLACEMENT_SCHEMES[0];
}

export const LEAGUE_WINDOW_WEEKS = 6;

/** The rolling window the league defaults to, as half-open [from, to). */
export function rollingWindow(weeks: number = LEAGUE_WINDOW_WEEKS): {
  from: Date;
  to: Date;
} {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - weeks * 7);
  return { from, to };
}
