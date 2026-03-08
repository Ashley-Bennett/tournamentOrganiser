import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "./format";

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------

describe("formatDateTime", () => {
  it("returns an empty string for null", () => {
    expect(formatDateTime(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(formatDateTime(undefined)).toBe("");
  });

  it("returns a non-empty string for a valid ISO date-time string", () => {
    const result = formatDateTime("2024-06-15T12:00:00Z");
    expect(result).toBeTruthy();
  });

  it("includes the year in the formatted output", () => {
    // Locale-agnostic: every locale includes the 4-digit year somewhere
    expect(formatDateTime("2024-06-15T12:00:00Z")).toContain("2024");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date string", () => {
    const result = formatDate("2024-06-15T12:00:00Z");
    expect(result).toBeTruthy();
  });

  it("includes the year in the formatted output", () => {
    expect(formatDate("2024-06-15T12:00:00Z")).toContain("2024");
  });
});
