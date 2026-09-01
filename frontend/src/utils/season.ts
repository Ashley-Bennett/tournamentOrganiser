// Pokémon competitive season helpers.
//
// A season runs 1 September → 31 August and is named by the calendar year it
// starts in: the 2026 season is "2026/27". Season quarters follow the same
// boundaries, three months at a time:
//
//   Q1 Sep–Nov   Q2 Dec–Feb   Q3 Mar–May   Q4 Jun–Aug
//
// Ranges are half-open [from, to) and built in the viewer's local timezone,
// then sent to the stats RPCs as ISO strings.

export const SEASON_START_MONTH = 8; // September, 0-indexed

export interface DateRange {
  from: Date;
  to: Date;
}

export const SEASON_QUARTERS = [
  { quarter: 1, label: "Q1", months: "Sep–Nov" },
  { quarter: 2, label: "Q2", months: "Dec–Feb" },
  { quarter: 3, label: "Q3", months: "Mar–May" },
  { quarter: 4, label: "Q4", months: "Jun–Aug" },
] as const;

/** The season a date falls in, named by its starting year. Aug 2027 → 2026. */
export function seasonStartYear(date: Date = new Date()): number {
  return date.getMonth() >= SEASON_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;
}

/** "2026/27" */
export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function seasonRange(startYear: number): DateRange {
  return {
    from: new Date(startYear, SEASON_START_MONTH, 1),
    to: new Date(startYear + 1, SEASON_START_MONTH, 1),
  };
}

/** Range for one quarter (1–4) of a season. Month overflow rolls the year on. */
export function seasonQuarterRange(startYear: number, quarter: number): DateRange {
  const startMonth = SEASON_START_MONTH + (quarter - 1) * 3;
  return {
    from: new Date(startYear, startMonth, 1),
    to: new Date(startYear, startMonth + 3, 1),
  };
}

/** The season quarter a date falls in (1–4). */
export function seasonQuarter(date: Date = new Date()): number {
  const monthsIn = (date.getMonth() - SEASON_START_MONTH + 12) % 12;
  return Math.floor(monthsIn / 3) + 1;
}

/** A selected stats period: a season, optionally narrowed to one quarter. */
export interface StatsPeriod {
  seasonStartYear: number | null; // null = all time
  quarter: number | null;
}

export const ALL_TIME: StatsPeriod = { seasonStartYear: null, quarter: null };

export function periodRange(period: StatsPeriod): DateRange | null {
  if (period.seasonStartYear == null) return null;
  return period.quarter == null
    ? seasonRange(period.seasonStartYear)
    : seasonQuarterRange(period.seasonStartYear, period.quarter);
}

/** RPC arguments for a period — nulls mean "no bound", i.e. all time. */
export function periodArgs(period: StatsPeriod): { p_from: string | null; p_to: string | null } {
  const range = periodRange(period);
  return {
    p_from: range ? range.from.toISOString() : null,
    p_to: range ? range.to.toISOString() : null,
  };
}

export function periodLabel(period: StatsPeriod): string {
  if (period.seasonStartYear == null) return "All time";
  const season = seasonLabel(period.seasonStartYear);
  return period.quarter == null ? `Season ${season}` : `Q${period.quarter} ${season}`;
}
