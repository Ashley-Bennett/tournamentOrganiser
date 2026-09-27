import { describe, expect, it } from "vitest";
import { matchesSearch } from "./search";

describe("matchesSearch", () => {
  it("matches words in any order across hyphens", () => {
    expect(matchesSearch("mega chandelure", "Mega Chandelure")).toBe(true);
    expect(matchesSearch("chandelure mega", "Mega Chandelure")).toBe(true);
    expect(matchesSearch("chandelure-mega", "Mega Chandelure")).toBe(true);
    expect(matchesSearch("mega chandelure", "chandelure-mega")).toBe(true);
  });

  it("matches across fields", () => {
    expect(matchesSearch("mega chand", "Mega Chandelure", "chandelure-mega", "10291")).toBe(true);
    expect(matchesSearch("10291", "Mega Chandelure", "chandelure-mega", "10291")).toBe(true);
  });

  it("ignores accents and case", () => {
    expect(matchesSearch("POKEMON", "Pokémon")).toBe(true);
    expect(matchesSearch("flabebe", "Flabébé")).toBe(true);
  });

  it("requires every word", () => {
    expect(matchesSearch("mega absol", "Mega Chandelure")).toBe(false);
  });

  it("treats a blank query as matching everything", () => {
    expect(matchesSearch("   ", "anything")).toBe(true);
  });
});
