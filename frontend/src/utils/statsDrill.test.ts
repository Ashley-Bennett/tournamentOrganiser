import { describe, it, expect } from "vitest";
import {
  parseDrill,
  playerNameFromKey,
  pushView,
  sameView,
  serialiseDrill,
  type DetailView,
} from "./statsDrill";

const deck = (
  p1: number | null,
  p2: number | null,
  scoped = false,
): DetailView => ({ kind: "deck", p1, p2, scoped });
const player = (identityKey: string): DetailView => ({
  kind: "player",
  identityKey,
});

describe("round trip", () => {
  it("survives a deck with two slots", () => {
    const stack = [deck(6, 18)];
    expect(parseDrill(serialiseDrill(stack))).toEqual(stack);
  });

  // A deck can legitimately have one slot, or none at all.
  it("survives a deck with a missing slot", () => {
    expect(parseDrill(serialiseDrill([deck(6, null)]))).toEqual([deck(6, null)]);
    expect(parseDrill(serialiseDrill([deck(null, null)]))).toEqual([
      deck(null, null),
    ]);
  });

  // Identity keys are "name:dave" for accountless regulars, so the colon that
  // separates kind from payload also appears inside the payload.
  it("survives an identity key containing a colon", () => {
    const stack = [player("name:dave smith")];
    expect(parseDrill(serialiseDrill(stack))).toEqual(stack);
  });

  it("survives a uuid identity key", () => {
    const stack = [player("a2fe20e0-1c08-43af-9e1e-515bb2fb0abf")];
    expect(parseDrill(serialiseDrill(stack))).toEqual(stack);
  });

  it("survives a deep stack in order", () => {
    const stack = [deck(6, 18), player("name:dave"), deck(25, null)];
    expect(parseDrill(serialiseDrill(stack))).toEqual(stack);
  });
});

describe("event scope", () => {
  // The URL is the source of truth, so a scope that is not encoded is lost the
  // moment anything else is pushed — which is how a deck opened from the meta
  // share table silently became an unscoped one.
  it("survives a round trip", () => {
    expect(parseDrill(serialiseDrill([deck(6, 18, true)]))).toEqual([
      deck(6, 18, true),
    ]);
  });

  // A pasted link has no meta share window behind it, so it must cover
  // everything rather than inheriting an empty event list and showing nothing.
  it("defaults to unscoped when the flag is absent", () => {
    expect(parseDrill("deck:6-18")).toEqual([deck(6, 18, false)]);
  });

  it("ignores an unrecognised flag rather than dropping the view", () => {
    expect(parseDrill("deck:6-18:nonsense")).toEqual([deck(6, 18, false)]);
  });

  it("separates a scoped view from an unscoped one", () => {
    expect(sameView(deck(6, 18, true), deck(6, 18, false))).toBe(false);
  });
});

describe("serialiseDrill", () => {
  it("returns null for an empty stack so the param is removed", () => {
    expect(serialiseDrill([])).toBeNull();
  });
});

describe("parseDrill", () => {
  it("treats a missing param as an empty stack", () => {
    expect(parseDrill(null)).toEqual([]);
    expect(parseDrill("")).toEqual([]);
  });

  // A hand-edited or truncated URL must not take the page down.
  it("drops entries it cannot read, keeping the rest", () => {
    expect(parseDrill("deck:6-18,nonsense,player:name%3Adave")).toEqual([
      deck(6, 18),
      player("name:dave"),
    ]);
  });

  it("drops a deck with a non-numeric slot", () => {
    expect(parseDrill("deck:abc-18")).toEqual([]);
  });

  it("drops a deck with no dash at all", () => {
    expect(parseDrill("deck:618")).toEqual([]);
  });

  it("drops a player with an empty key", () => {
    expect(parseDrill("player:")).toEqual([]);
  });

  it("drops an unknown kind", () => {
    expect(parseDrill("event:abc")).toEqual([]);
  });
});

describe("sameView", () => {
  it("matches identical views", () => {
    expect(sameView(deck(6, 18), deck(6, 18))).toBe(true);
    expect(sameView(player("name:dave"), player("name:dave"))).toBe(true);
  });

  it("separates different kinds and different payloads", () => {
    expect(sameView(deck(6, 18), deck(6, 19))).toBe(false);
    expect(sameView(deck(6, null), player("name:dave"))).toBe(false);
    expect(sameView(player("name:dave"), player("name:dan"))).toBe(false);
  });
});

describe("pushView", () => {
  it("adds a step", () => {
    expect(pushView([deck(6, 18)], player("name:dave"))).toEqual([
      deck(6, 18),
      player("name:dave"),
    ]);
  });

  // Clicking through to the player you are already looking at should not add a
  // step you then have to press back to escape.
  it("ignores a push of the view already on top", () => {
    const stack = [deck(6, 18), player("name:dave")];
    expect(pushView(stack, player("name:dave"))).toBe(stack);
  });

  it("allows revisiting something further down the stack", () => {
    const stack = [player("name:dave"), deck(6, 18)];
    expect(pushView(stack, player("name:dave"))).toHaveLength(3);
  });
});

describe("playerNameFromKey", () => {
  // A pasted link opens at the deepest step, so every crumb above it has never
  // rendered and has no learned label to show.
  it("recovers a name from an accountless identity key", () => {
    expect(playerNameFromKey("name:aisha bello")).toBe("Aisha Bello");
    expect(playerNameFromKey("name:jon baker")).toBe("Jon Baker");
  });

  it("copes with extra whitespace", () => {
    expect(playerNameFromKey("name:  dave   smith ")).toBe("Dave Smith");
  });

  // An account is keyed by uuid, which carries no name at all.
  it("gives up on a uuid key", () => {
    expect(playerNameFromKey("a2fe20e0-1c08-43af-9e1e-515bb2fb0abf")).toBeNull();
  });

  it("gives up on an empty name", () => {
    expect(playerNameFromKey("name:")).toBeNull();
    expect(playerNameFromKey("name:   ")).toBeNull();
  });
});
