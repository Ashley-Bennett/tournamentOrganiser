import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGame, rulesFor } from "./registry";
import { GENERIC_RULES, POKEMON_RULES } from "./rules";

/**
 * Guards the wiring between a tournament row and the rules it is scored under.
 *
 * The bug these exist for: `TournamentMatches` derived its rules from
 * `tournament.game_id` but fetched the row without that column, so every
 * Pokémon event on the matches page was silently scored as a generic one —
 * Buchholz in the standings instead of OMW%/OOMW%, game scores hidden, and
 * best-of-3 validation skipped.
 *
 * Nothing threw, because an unresolved id falls back to the default game by
 * design (see below). The component tests could not catch it either: they pass
 * `rules` in directly, so they never exercise the fetch that supplies it.
 * That leaves the select strings themselves as the thing worth pinning.
 */

// vitest runs with `frontend` as its root.
const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("rules fallback", () => {
  it("falls back to the generic profile for an unknown or missing game", () => {
    // This is deliberate — an id the registry has never heard of must still
    // render — but it is also why a missing `game_id` fails silently rather
    // than loudly. The select-list tests below are what make it safe.
    expect(getGame(undefined).id).toBe("generic");
    expect(getGame(null).id).toBe("generic");
    expect(getGame("no_such_game").id).toBe("generic");
    expect(rulesFor(undefined)).toBe(GENERIC_RULES);
  });

  it("resolves a known game to its own profile", () => {
    expect(rulesFor("pokemon")).toBe(POKEMON_RULES);
    expect(rulesFor("generic")).toBe(GENERIC_RULES);
  });
});

/**
 * Every file that scores or displays a tournament by its rules profile, and
 * gets the row from a PostgREST select rather than an RPC.
 */
const FILES_SELECTING_TOURNAMENTS = [
  "pages/TournamentMatches/index.tsx",
  "pages/TournamentPairings.tsx",
  "pages/TournamentLeaderboard.tsx",
  "hooks/useTournament.ts",
];

describe("tournament select lists include game_id", () => {
  it.each(FILES_SELECTING_TOURNAMENTS)(
    "%s fetches game_id in every tournaments select",
    (rel) => {
      const source = read(rel);

      // `tournament_type` is only ever selected from the tournaments table, so
      // it identifies the selects that matter without matching other tables.
      const selects = [...source.matchAll(/\.select\(\s*"([^"]*tournament_type[^"]*)"/g)].map(
        (m) => m[1],
      );

      expect(
        selects.length,
        `no tournaments select found in ${rel} — has the query been rewritten?`,
      ).toBeGreaterThan(0);

      for (const select of selects) {
        expect(
          select.split(",").map((c) => c.trim()),
          `a tournaments select in ${rel} omits game_id, so rulesFor() will ` +
            `silently fall back to the generic profile`,
        ).toContain("game_id");
      }
    },
  );
});

describe("final standings are persisted under the event's own rules", () => {
  it("useRoundLifecycle ranks by the tournament's profile, not a hardcoded one", () => {
    const source = read("hooks/useRoundLifecycle.ts");

    // sortByTieBreakers hardcodes POKEMON_RULES. Using it here would write
    // Pokémon placings into a generic event's stored standings.
    expect(
      source.includes("sortByTieBreakers"),
      "useRoundLifecycle must not use sortByTieBreakers — it hardcodes " +
        "POKEMON_RULES. Use sortByProfile(raw, rulesFor(tournament.game_id)).",
    ).toBe(false);

    expect(source).toContain("rulesFor(tournament.game_id)");
  });
});
