// Time filter for the stats page.
//
// All time, or a single calendar year — the same for every game. This replaced
// a Play! Pokémon season model (September to August, split into quarters),
// which meant nothing outside Pokémon and was more machinery than the filter
// needed. A custom from/to range is the intended next step.
//
// Ranges are half-open [from, to) and built in the viewer's local timezone,
// then sent to the stats RPCs as ISO strings.

export interface DateRange {
  from: Date;
  to: Date;
}

/** A selected stats period. `null` year means all time. */
export interface StatsPeriod {
  year: number | null;
}

export const ALL_TIME: StatsPeriod = { year: null };

export function yearRange(year: number): DateRange {
  return {
    from: new Date(year, 0, 1),
    to: new Date(year + 1, 0, 1),
  };
}

export function periodRange(period: StatsPeriod): DateRange | null {
  return period.year == null ? null : yearRange(period.year);
}

/**
 * RPC arguments for a period — undefined means "no bound", i.e. all time.
 *
 * undefined rather than null because every one of these parameters is
 * `DEFAULT NULL` in SQL, so an omitted argument and an explicit null reach the
 * function identically, and the generated Args types only admit the former.
 */
export function periodArgs(period: StatsPeriod): {
  p_from: string | undefined;
  p_to: string | undefined;
} {
  const range = periodRange(period);
  return {
    p_from: range ? range.from.toISOString() : undefined,
    p_to: range ? range.to.toISOString() : undefined,
  };
}

export function periodLabel(period: StatsPeriod): string {
  return period.year == null ? "All time" : String(period.year);
}
