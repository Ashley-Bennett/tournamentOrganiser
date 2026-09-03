import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GAMES } from "./registry";
import {
  defaultPartnerKey,
  hasPartner,
  isValidPartnerKey,
  partnerImage,
  partnerOptions,
} from "./partners";

describe("the registry declares a partner source per game", () => {
  it("gives every game a source, including the ones not built yet", () => {
    GAMES.forEach((g) => {
      expect(g.partner).toBeDefined();
    });
  });

  // A game nobody can pick yet needs no art commissioned for it.
  it("gives coming-soon games no partner slot", () => {
    GAMES.filter((g) => g.status === "coming_soon").forEach((g) => {
      expect(g.partner.kind).toBe("none");
    });
  });

  // The default has to be one of the options, or a player who has chosen
  // nothing gets nothing.
  it("keeps every declared default inside its own set", () => {
    GAMES.forEach((g) => {
      if (g.partner.kind === "set") {
        const keys = g.partner.options.map((o) => o.key);
        expect(keys).toContain(g.partner.defaultKey);
      }
    });
  });

  it("keeps set keys unique", () => {
    GAMES.forEach((g) => {
      if (g.partner.kind === "set") {
        const keys = g.partner.options.map((o) => o.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });
  });
});

describe("declared partner art exists", () => {
  // A missing file is a picker full of broken images, and nothing in the type
  // system catches it — the src is just a string.
  it("ships a file for every option every game declares", () => {
    GAMES.forEach((g) => {
      if (g.partner.kind !== "set") return;
      g.partner.options.forEach((o) => {
        const file = join(process.cwd(), "public", o.src);
        expect(existsSync(file), `missing ${o.src}`).toBe(true);
      });
    });
  });

  it("ships them as usable svg", () => {
    GAMES.forEach((g) => {
      if (g.partner.kind !== "set") return;
      g.partner.options.forEach((o) => {
        const svg = readFileSync(join(process.cwd(), "public", o.src), "utf8");
        expect(svg).toContain("<svg");
        // currentColor so a partner inherits the theme rather than being
        // painted for one of them.
        expect(svg).toContain("currentColor");
      });
    });
  });
});

describe("hasPartner", () => {
  it("is true for a game with a source and false otherwise", () => {
    expect(hasPartner("pokemon")).toBe(true);
    expect(hasPartner("generic")).toBe(true);
    expect(hasPartner(null)).toBe(false);
    expect(hasPartner("not-a-game")).toBe(false);
  });
});

describe("defaults", () => {
  it("is Ditto for Pokémon", () => {
    expect(defaultPartnerKey("pokemon")).toBe("132");
  });

  it("is the pawn for a generic event", () => {
    expect(defaultPartnerKey("generic")).toBe("pawn");
  });

  it("is null where there is no partner", () => {
    expect(defaultPartnerKey("not-a-game")).toBeNull();
  });
});

describe("partnerOptions", () => {
  // Pokémon is unbounded, so the picker there is a species search rather than
  // a list of tiles.
  it("is empty for Pokémon and populated for generic", () => {
    expect(partnerOptions("pokemon")).toEqual([]);
    expect(partnerOptions("generic").length).toBeGreaterThan(0);
  });
});

describe("partnerImage", () => {
  it("resolves a species to its official artwork", () => {
    const url = partnerImage("pokemon", "25");
    expect(url).toContain("/25.png");
    expect(url).toContain("official-artwork");
  });

  // The whole point: what you pick is what appears. Deck choosing shows pixel
  // sprites while searching and artwork once chosen, which is fine for a deck
  // but a bait and switch for a picture you chose to show off.
  it("gives one image per partner, with no variant to get wrong", () => {
    expect(partnerImage.length).toBe(2);
  });

  it("falls back to Ditto for an unusable species key", () => {
    expect(partnerImage("pokemon", "chess-knight")).toContain("/132.png");
    expect(partnerImage("pokemon", "-4")).toContain("/132.png");
  });

  it("resolves a declared set item", () => {
    expect(partnerImage("generic", "knight")).toBe(
      "/partners/generic/knight.svg",
    );
  });

  // A withdrawn set item, or a card written by an older client, should show
  // the starting partner rather than a hole in the card.
  it("falls back to the default for an unknown set key", () => {
    expect(partnerImage("generic", "gone")).toBe("/partners/generic/pawn.svg");
  });

  it("uses the default when nothing has been chosen", () => {
    expect(partnerImage("generic", null)).toBe("/partners/generic/pawn.svg");
    expect(partnerImage("pokemon", null)).toContain("/132.png");
  });

  it("is null where the game has no partner", () => {
    expect(partnerImage("not-a-game", "pawn")).toBeNull();
  });
});

describe("isValidPartnerKey", () => {
  it("accepts a species number and rejects anything else", () => {
    expect(isValidPartnerKey("pokemon", "25")).toBe(true);
    expect(isValidPartnerKey("pokemon", "pawn")).toBe(false);
    expect(isValidPartnerKey("pokemon", "0")).toBe(false);
  });

  it("accepts only declared keys for a set", () => {
    expect(isValidPartnerKey("generic", "meeple")).toBe(true);
    expect(isValidPartnerKey("generic", "132")).toBe(false);
  });

  it("rejects everything for a game with no partner", () => {
    expect(isValidPartnerKey("not-a-game", "pawn")).toBe(false);
  });
});
