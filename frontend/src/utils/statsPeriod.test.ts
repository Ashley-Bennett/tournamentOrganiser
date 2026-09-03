import { describe, it, expect } from "vitest";
import {
  ALL_TIME,
  periodArgs,
  periodLabel,
  periodRange,
  yearRange,
  type StatsPeriod,
} from "./statsPeriod";

describe("yearRange", () => {
  it("runs from 1 January to 1 January", () => {
    const range = yearRange(2026);
    expect(range.from).toEqual(new Date(2026, 0, 1));
    expect(range.to).toEqual(new Date(2027, 0, 1));
  });

  // Half-open: a tournament at midnight on 1 Jan belongs to the new year only.
  it("excludes the first instant of the next year", () => {
    const { to } = yearRange(2026);
    expect(to.getTime()).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe("periodRange", () => {
  it("has no bounds for all time", () => {
    expect(periodRange(ALL_TIME)).toBeNull();
  });

  it("bounds a chosen year", () => {
    const range = periodRange({ year: 2025 });
    expect(range?.from).toEqual(new Date(2025, 0, 1));
    expect(range?.to).toEqual(new Date(2026, 0, 1));
  });
});

describe("periodArgs", () => {
  it("omits both bounds for all time, so the RPC applies none", () => {
    expect(periodArgs(ALL_TIME)).toEqual({ p_from: undefined, p_to: undefined });
  });

  it("sends ISO strings for a year", () => {
    const args = periodArgs({ year: 2026 });
    expect(args.p_from).toBe(new Date(2026, 0, 1).toISOString());
    expect(args.p_to).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe("periodLabel", () => {
  it("names the period", () => {
    expect(periodLabel(ALL_TIME)).toBe("All time");
    expect(periodLabel({ year: 2026 })).toBe("2026");
  });

  // No season means no split-year label — 2026 is just 2026.
  it("never reads as a split year", () => {
    const period: StatsPeriod = { year: 2026 };
    expect(periodLabel(period)).not.toContain("/");
  });
});
