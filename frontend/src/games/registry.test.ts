import { describe, it, expect } from "vitest";
import {
  AVAILABLE_GAMES,
  GAMES,
  formatLabel,
  getGame,
  getGameFormat,
  rulesFor,
  structureLabel,
} from "./registry";
import { GENERIC_RULES, POKEMON_RULES } from "./rules";

describe("games registry", () => {
  it("offers only implemented games for selection", () => {
    expect(AVAILABLE_GAMES.map((g) => g.id)).toEqual(["pokemon", "generic"]);
  });

  it("still lists the unimplemented games so the roadmap is visible", () => {
    const soon = GAMES.filter((g) => g.status === "coming_soon").map((g) => g.id);
    expect(soon).toContain("magic");
    expect(soon.length).toBeGreaterThan(0);
  });

  it("gives every game a unique id", () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
  });

  it("scores Pokémon events under the Play! Pokémon profile", () => {
    expect(rulesFor("pokemon")).toBe(POKEMON_RULES);
  });

  it("keeps generic events free of any game-specific surface", () => {
    const generic = getGame("generic");
    expect(generic.rules).toBe(GENERIC_RULES);
    expect(generic.deck).toBe("none");
    expect(generic.formats).toEqual([]);
  });

  it("uses the calendar year for a game with no published season", () => {
    expect(getGame("pokemon").season.startMonth).toBe(9);
    expect(getGame("generic").season.startMonth).toBe(1);
  });

  // A tournament row outlives the registry entry it was created against.
  it("falls back to generic for a game this build does not know", () => {
    expect(getGame("some_withdrawn_game").id).toBe("generic");
    expect(getGame(null).id).toBe("generic");
    expect(getGame(undefined).id).toBe("generic");
  });
});

describe("format labels", () => {
  it("names a known format", () => {
    expect(formatLabel("pokemon", "standard")).toBe("Standard");
    expect(getGameFormat("pokemon", "glc")?.name).toBe("Gym Leader Challenge");
  });

  // game_format was organiser-typed free text before the registry existed.
  it("shows an unrecognised stored format as-is rather than hiding it", () => {
    expect(formatLabel("pokemon", "Retro cup 2019")).toBe("Retro cup 2019");
  });

  it("has nothing to show when no format was recorded", () => {
    expect(formatLabel("pokemon", null)).toBeNull();
    expect(getGameFormat("generic", null)).toBeNull();
  });
});

describe("structureLabel", () => {
  it("names each structure", () => {
    expect(structureLabel("swiss")).toBe("Swiss");
    expect(structureLabel("round_robin")).toBe("Round Robin");
    expect(structureLabel("single_elimination")).toBe("Single Elimination");
  });
});
