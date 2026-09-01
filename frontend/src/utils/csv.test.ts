import { describe, it, expect } from "vitest";
import { slugForFile, toCsv } from "./csv";

const BOM = "﻿";

function body(csv: string): string[] {
  return csv.replace(BOM, "").split("\r\n");
}

describe("toCsv", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv(["Player", "Events"], [["Dan", 6], ["Priya", 5]]);
    expect(body(csv)).toEqual(['"Player","Events"', '"Dan","6"', '"Priya","5"']);
  });

  it("starts with a BOM so Excel reads accents correctly", () => {
    // Without it, "Pokémon" opens as mojibake in Excel on Windows.
    expect(toCsv(["Deck"], [["Pokémon"]]).startsWith(BOM)).toBe(true);
  });

  it("doubles embedded quotes rather than breaking the field", () => {
    const csv = toCsv(["Name"], [['Dan "The Wall" Okafor']]);
    expect(body(csv)[1]).toBe('"Dan ""The Wall"" Okafor"');
  });

  it("keeps commas and newlines inside a single quoted field", () => {
    const csv = toCsv(["Name"], [["Okafor, Dan"], ["two\nlines"]]);
    expect(body(csv)[1]).toBe('"Okafor, Dan"');
    expect(csv).toContain('"two\nlines"');
  });

  // Bare rather than `""` — an unquoted empty field is valid CSV and parses
  // back as empty, so there is nothing to quote.
  it("writes an empty field for null and undefined", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(body(csv)[1]).toBe(",");
  });

  // Player names and deck labels are user-supplied and land straight in a
  // spreadsheet, so a leading =, +, - or @ must not be treated as a formula.
  it.each(["=1+1", "+1", "-1", "@SUM(A1)"])(
    "defuses %s so a spreadsheet treats it as text",
    (value) => {
      expect(body(toCsv(["X"], [[value]]))[1]).toBe(`"'${value}"`);
    },
  );

  it("leaves an ordinary negative number alone once it is a number", () => {
    // Numbers arrive as numbers from the table's csvValue, and -3 as a number
    // still stringifies with a leading "-", so it is guarded too. That is
    // deliberate: correctness of the text beats losing a numeric cell.
    expect(body(toCsv(["X"], [[-3]]))[1]).toBe(`"'-3"`);
  });
});

describe("slugForFile", () => {
  it("lowercases and hyphenates", () => {
    expect(slugForFile("My Workspace")).toBe("my-workspace");
  });

  it("joins the parts it is given and drops empty ones", () => {
    expect(slugForFile("Matchamp", null, "League", "")).toBe("matchamp-league");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(slugForFile("Thursday Locals #14!")).toBe("thursday-locals-14");
  });
});
