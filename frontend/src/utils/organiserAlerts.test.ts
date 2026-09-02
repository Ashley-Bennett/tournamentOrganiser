import { describe, it, expect } from "vitest";
import {
  baselineOf,
  organiserDiff,
  organiserHref,
  type OrganiserAlertRow,
} from "./organiserAlerts";

const row = (overrides: Partial<OrganiserAlertRow> = {}): OrganiserAlertRow => ({
  tournament_id: "t1",
  tournament_name: "Thursday Locals #15",
  workspace_slug: "cardiff-league",
  round_number: 3,
  total_matches: 8,
  settled_matches: 4,
  conflict_count: 0,
  ...overrides,
});

const settled = (o: Partial<OrganiserAlertRow> = {}) =>
  row({ settled_matches: 8, ...o });

describe("organiserHref", () => {
  it("points at the workspace-scoped matches page", () => {
    expect(organiserHref(row())).toBe(
      "/w/cardiff-league/tournaments/t1/matches",
    );
  });
});

describe("first observation", () => {
  // Opening the app to a round that finished ten minutes ago must be silent.
  it("seeds without raising anything, even when the round is complete", () => {
    expect(organiserDiff(settled(), null).raise).toEqual([]);
  });

  it("seeds silently even with a conflict already present", () => {
    expect(organiserDiff(row({ conflict_count: 2 }), null).raise).toEqual([]);
  });
});

describe("all results in", () => {
  it("fires when the last result lands", () => {
    const prev = baselineOf(row());
    const { raise } = organiserDiff(settled(), prev);
    expect(raise).toHaveLength(1);
    expect(raise[0]?.type).toBe("results_all_in");
    expect(raise[0]?.message).toBe(
      "All results are in for Round 3. Ready to pair.",
    );
    expect(raise[0]?.roundNumber).toBe(3);
  });

  it("does not fire again while nothing changes", () => {
    const prev = baselineOf(settled());
    expect(organiserDiff(settled(), prev).raise).toEqual([]);
  });

  it("fires again for the next round", () => {
    const prev = baselineOf(settled());
    const next = settled({ round_number: 4 });
    const { raise } = organiserDiff(next, prev);
    expect(raise.map((n) => n.type)).toEqual(["results_all_in"]);
    expect(raise[0]?.roundNumber).toBe(4);
  });

  // A freshly paired round is empty, not complete.
  it("does not fire for a round with no matches", () => {
    const prev = baselineOf(row());
    const empty = row({ total_matches: 0, settled_matches: 0 });
    expect(organiserDiff(empty, prev).raise).toEqual([]);
  });

  it("does not fire while results are still outstanding", () => {
    const prev = baselineOf(row({ settled_matches: 0 }));
    expect(organiserDiff(row({ settled_matches: 7 }), prev).raise).toEqual([]);
  });
});

describe("conflicts", () => {
  it("fires when a disagreement appears", () => {
    const prev = baselineOf(row());
    const { raise } = organiserDiff(row({ conflict_count: 1 }), prev);
    expect(raise).toHaveLength(1);
    expect(raise[0]?.type).toBe("result_conflict");
    expect(raise[0]?.message).toBe("A result in Round 3 needs a decision");
  });

  it("counts them when there is more than one", () => {
    const prev = baselineOf(row());
    const { raise } = organiserDiff(row({ conflict_count: 3 }), prev);
    expect(raise[0]?.message).toBe("3 results in Round 3 need a decision");
  });

  it("does not re-fire while the disagreement is unresolved", () => {
    const prev = baselineOf(row({ conflict_count: 1 }));
    expect(organiserDiff(row({ conflict_count: 2 }), prev).raise).toEqual([]);
  });

  it("resolves the prompt once the organiser has settled it", () => {
    const prev = baselineOf(row({ conflict_count: 1 }));
    const { raise, resolve } = organiserDiff(row({ conflict_count: 0 }), prev);
    expect(raise).toEqual([]);
    expect(resolve).toEqual([{ type: "result_conflict", roundNumber: 3 }]);
  });

  it("has nothing to resolve when there was never a conflict", () => {
    const prev = baselineOf(row());
    expect(organiserDiff(row(), prev).resolve).toEqual([]);
  });
});

describe("a new round resets both signals", () => {
  // Round 4 being incomplete says nothing about round 3, and round 3's
  // notification stays in the list as history rather than being resolved.
  it("does not resolve the previous round's conflict just because the round moved on", () => {
    const prev = baselineOf(row({ conflict_count: 1 }));
    const next = row({ round_number: 4, conflict_count: 0 });
    expect(organiserDiff(next, prev).resolve).toEqual([]);
  });

  it("can raise both events at once for a new round", () => {
    const prev = baselineOf(row());
    const next = settled({ round_number: 4, conflict_count: 1 });
    const { raise } = organiserDiff(next, prev);
    expect(raise.map((n) => n.type)).toEqual([
      "results_all_in",
      "result_conflict",
    ]);
  });
});
