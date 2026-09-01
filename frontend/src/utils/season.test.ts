import { describe, it, expect } from "vitest";
import {
  ALL_TIME,
  SEASON_QUARTERS,
  periodArgs,
  periodLabel,
  periodRange,
  seasonLabel,
  seasonQuarter,
  seasonQuarterRange,
  seasonRange,
  seasonStartYear,
} from "./season";

describe("seasonStartYear", () => {
  it("starts a new season on 1 September", () => {
    expect(seasonStartYear(new Date(2026, 7, 31))).toBe(2025); // 31 Aug 2026
    expect(seasonStartYear(new Date(2026, 8, 1))).toBe(2026); // 1 Sep 2026
  });

  it("keeps January in the season that started the previous September", () => {
    expect(seasonStartYear(new Date(2027, 0, 15))).toBe(2026);
  });
});

describe("seasonLabel", () => {
  it("names a season by both years", () => {
    expect(seasonLabel(2026)).toBe("2026/27");
  });

  it("pads a single-digit second year", () => {
    expect(seasonLabel(2009)).toBe("2009/10");
  });
});

describe("seasonRange", () => {
  it("runs 1 Sep to 1 Sep the following year", () => {
    const { from, to } = seasonRange(2026);
    expect(from).toEqual(new Date(2026, 8, 1));
    expect(to).toEqual(new Date(2027, 8, 1));
  });
});

describe("seasonQuarterRange", () => {
  it("splits the season into Sep-Nov, Dec-Feb, Mar-May, Jun-Aug", () => {
    expect(seasonQuarterRange(2026, 1).from).toEqual(new Date(2026, 8, 1));
    expect(seasonQuarterRange(2026, 2).from).toEqual(new Date(2026, 11, 1));
    expect(seasonQuarterRange(2026, 3).from).toEqual(new Date(2027, 2, 1));
    expect(seasonQuarterRange(2026, 4).from).toEqual(new Date(2027, 5, 1));
  });

  it("ends the last quarter exactly where the next season starts", () => {
    expect(seasonQuarterRange(2026, 4).to).toEqual(seasonRange(2026).to);
  });

  it("covers the whole season with no gaps or overlaps", () => {
    const quarters = SEASON_QUARTERS.map((q) => seasonQuarterRange(2026, q.quarter));
    quarters.slice(1).forEach((q, i) => {
      expect(q.from).toEqual(quarters[i].to);
    });
  });
});

describe("seasonQuarter", () => {
  it("maps a date to its season quarter", () => {
    expect(seasonQuarter(new Date(2026, 8, 5))).toBe(1); // Sep
    expect(seasonQuarter(new Date(2027, 0, 5))).toBe(2); // Jan
    expect(seasonQuarter(new Date(2027, 3, 5))).toBe(3); // Apr
    expect(seasonQuarter(new Date(2027, 7, 31))).toBe(4); // Aug
  });
});

describe("periodRange / periodArgs", () => {
  it("has no bounds for all time", () => {
    expect(periodRange(ALL_TIME)).toBeNull();
    expect(periodArgs(ALL_TIME)).toEqual({ p_from: null, p_to: null });
  });

  it("uses the whole season when no quarter is picked", () => {
    const args = periodArgs({ seasonStartYear: 2026, quarter: null });
    expect(args.p_from).toBe(new Date(2026, 8, 1).toISOString());
    expect(args.p_to).toBe(new Date(2027, 8, 1).toISOString());
  });

  it("narrows to a single quarter", () => {
    const args = periodArgs({ seasonStartYear: 2026, quarter: 2 });
    expect(args.p_from).toBe(new Date(2026, 11, 1).toISOString());
    expect(args.p_to).toBe(new Date(2027, 2, 1).toISOString());
  });
});

describe("periodLabel", () => {
  it("describes each kind of period", () => {
    expect(periodLabel(ALL_TIME)).toBe("All time");
    expect(periodLabel({ seasonStartYear: 2026, quarter: null })).toBe("Season 2026/27");
    expect(periodLabel({ seasonStartYear: 2026, quarter: 3 })).toBe("Q3 2026/27");
  });
});
