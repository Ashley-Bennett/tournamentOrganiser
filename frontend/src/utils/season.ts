// Competitive season helpers.
//
// A season is a twelve-month block starting in a month the game decides, named
// by the calendar year it starts in. Play! Pokémon runs 1 September → 31 August,
// so the 2026 season is "2026/27" with quarters:
//
//   Q1 Sep–Nov   Q2 Dec–Feb   Q3 Mar–May   Q4 Jun–Aug
//
// A game with no published season (a generic event) uses the calendar year
// instead, where the season is simply "2026" and the quarters are the ordinary
// calendar ones. The start month comes from the game's registry entry, so every
// function here takes it; it defaults to September because that is what every
// caller wanted before games existed.
//
// Ranges are half-open [from, to) and built in the viewer's local timezone,
// then sent to the stats RPCs as ISO strings.

/** September, 0-indexed — the Play! Pokémon season start. */
export const SEASON_START_MONTH = 8;

/** Registry months are 1-12; the helpers here are 0-indexed. */
export function toMonthIndex(startMonth1: number): number {
  return ((startMonth1 - 1) % 12 + 12) % 12;
}

export interface DateRange {
  from: Date;
  to: Date;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface SeasonQuarter {
  quarter: number;
  label: string;
  months: string;
}

/** The four quarters of a season, labelled with the months they cover. */
export function seasonQuarters(startMonth = SEASON_START_MONTH): SeasonQuarter[] {
  return [1, 2, 3, 4].map((quarter) => {
    const first = (startMonth + (quarter - 1) * 3) % 12;
    const last = (first + 2) % 12;
    return {
      quarter,
      label: `Q${quarter}`,
      months: `${MONTH_NAMES[first]}–${MONTH_NAMES[last]}`,
    };
  });
}

/** The Pokémon quarters, kept as a constant for callers that predate games. */
export const SEASON_QUARTERS = seasonQuarters();

/** The season a date falls in, named by its starting year. Aug 2027 → 2026. */
export function seasonStartYear(
  date: Date = new Date(),
  startMonth = SEASON_START_MONTH,
): number {
  return date.getMonth() >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
}

/** "2026/27" for a split-year season, or just "2026" for a calendar one. */
export function seasonLabel(startYear: number, startMonth = SEASON_START_MONTH): string {
  if (startMonth === 0) return String(startYear);
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function seasonRange(startYear: number, startMonth = SEASON_START_MONTH): DateRange {
  return {
    from: new Date(startYear, startMonth, 1),
    to: new Date(startYear + 1, startMonth, 1),
  };
}

/** Range for one quarter (1–4) of a season. Month overflow rolls the year on. */
export function seasonQuarterRange(
  startYear: number,
  quarter: number,
  startMonth = SEASON_START_MONTH,
): DateRange {
  const first = startMonth + (quarter - 1) * 3;
  return {
    from: new Date(startYear, first, 1),
    to: new Date(startYear, first + 3, 1),
  };
}

/** The season quarter a date falls in (1–4). */
export function seasonQuarter(
  date: Date = new Date(),
  startMonth = SEASON_START_MONTH,
): number {
  const monthsIn = (date.getMonth() - startMonth + 12) % 12;
  return Math.floor(monthsIn / 3) + 1;
}

/** A selected stats period: a season, optionally narrowed to one quarter. */
export interface StatsPeriod {
  seasonStartYear: number | null; // null = all time
  quarter: number | null;
}

export const ALL_TIME: StatsPeriod = { seasonStartYear: null, quarter: null };

export function periodRange(
  period: StatsPeriod,
  startMonth = SEASON_START_MONTH,
): DateRange | null {
  if (period.seasonStartYear == null) return null;
  return period.quarter == null
    ? seasonRange(period.seasonStartYear, startMonth)
    : seasonQuarterRange(period.seasonStartYear, period.quarter, startMonth);
}

/** RPC arguments for a period — nulls mean "no bound", i.e. all time. */
export function periodArgs(
  period: StatsPeriod,
  startMonth = SEASON_START_MONTH,
): { p_from: string | null; p_to: string | null } {
  const range = periodRange(period, startMonth);
  return {
    p_from: range ? range.from.toISOString() : null,
    p_to: range ? range.to.toISOString() : null,
  };
}

export function periodLabel(
  period: StatsPeriod,
  startMonth = SEASON_START_MONTH,
): string {
  if (period.seasonStartYear == null) return "All time";
  const season = seasonLabel(period.seasonStartYear, startMonth);
  return period.quarter == null ? `Season ${season}` : `Q${period.quarter} ${season}`;
}
