import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import BadgeWatcher from "./BadgeWatcher";
import { clearAll, getNotifications } from "../utils/notificationStore";
import type { EarnedBadge } from "../badges/types";

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const state = {
  user: { id: "u1" } as { id: string } | null,
  badges: [] as EarnedBadge[],
  ready: true,
};

vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock("../hooks/useMyBadges", () => ({
  useMyBadges: () => ({
    badges: state.badges,
    loading: !state.ready,
    ready: state.ready,
    error: null,
    reload: vi.fn(),
  }),
}));

const attendance = (count: number): EarnedBadge => ({
  badgeId: "attendance",
  count,
  workspaceId: WS,
  workspaceName: "Bulwark",
});

const messages = () => getNotifications().map((n) => n.message);

beforeEach(() => {
  localStorage.clear();
  clearAll();
  state.user = { id: "u1" };
  state.badges = [];
  state.ready = true;
});

describe("BadgeWatcher", () => {
  // A player who has been coming for a year should not get a bell full of
  // things they earned months ago the first time this ships.
  it("seeds silently on a first run", async () => {
    state.badges = [attendance(8)];
    render(<BadgeWatcher />);
    await waitFor(() => expect(localStorage.getItem("mc_badge_snapshot")).not.toBeNull());
    expect(messages()).toEqual([]);
  });

  it("raises a promotion once the snapshot exists", async () => {
    state.badges = [attendance(8)];
    const first = render(<BadgeWatcher />);
    await waitFor(() => expect(localStorage.getItem("mc_badge_snapshot")).not.toBeNull());
    first.unmount();

    state.badges = [attendance(25)];
    render(<BadgeWatcher />);
    await waitFor(() =>
      expect(messages()).toEqual(["You are now Regular · Bulwark"]),
    );
  });

  it("raises nothing when nothing moved", async () => {
    state.badges = [attendance(8)];
    const first = render(<BadgeWatcher />);
    await waitFor(() => expect(localStorage.getItem("mc_badge_snapshot")).not.toBeNull());
    first.unmount();

    render(<BadgeWatcher />);
    await waitFor(() => expect(messages()).toEqual([]));
  });

  // The rung is in the id, so re-deriving the same promotion is a no-op.
  it("does not raise the same promotion twice", async () => {
    localStorage.setItem(
      "mc_badge_snapshot",
      JSON.stringify({ [`attendance::${WS}::`]: 8 }),
    );
    state.badges = [attendance(25)];

    const first = render(<BadgeWatcher />);
    await waitFor(() => expect(messages()).toHaveLength(1));
    first.unmount();

    // Snapshot rolled back, as a second device would have it.
    localStorage.setItem(
      "mc_badge_snapshot",
      JSON.stringify({ [`attendance::${WS}::`]: 8 }),
    );
    render(<BadgeWatcher />);
    await waitFor(() => expect(messages()).toHaveLength(1));
  });

  it("points at the badge wall rather than a tournament", async () => {
    localStorage.setItem(
      "mc_badge_snapshot",
      JSON.stringify({ [`attendance::${WS}::`]: 8 }),
    );
    state.badges = [attendance(25)];
    render(<BadgeWatcher />);
    await waitFor(() => expect(getNotifications()).toHaveLength(1));
    expect(getNotifications()[0].href).toMatch(/^\/me\/badges\?/);
  });

  // A corrupt snapshot must read as a first run, not as a wall of promotions.
  it("treats an unreadable snapshot as a first run", async () => {
    localStorage.setItem("mc_badge_snapshot", "not json");
    state.badges = [attendance(25)];
    render(<BadgeWatcher />);
    await waitFor(() => expect(localStorage.getItem("mc_badge_snapshot")).toContain("attendance"));
    expect(messages()).toEqual([]);
  });

  it("does nothing at all for a signed-out visitor", async () => {
    state.user = null;
    state.badges = [attendance(25)];
    render(<BadgeWatcher />);
    await waitFor(() => expect(messages()).toEqual([]));
    expect(localStorage.getItem("mc_badge_snapshot")).toBeNull();
  });

  // The hook reports "not loading" over an empty list before the fetch has
  // started, so the watcher waits for `ready` instead.
  it("waits for a real answer before deciding anything", async () => {
    state.ready = false;
    state.badges = [];
    render(<BadgeWatcher />);
    await waitFor(() => expect(messages()).toEqual([]));
    // No snapshot written from a half-loaded state, which would look like a
    // player who holds nothing and then earns everything.
    expect(localStorage.getItem("mc_badge_snapshot")).toBeNull();
  });
});

describe("where a badge notification leads", () => {
  it("deep-links to the badge that moved", async () => {
    localStorage.setItem(
      "mc_badge_snapshot",
      JSON.stringify({ [`attendance::${WS}::`]: 8 }),
    );
    state.badges = [attendance(25)];
    render(<BadgeWatcher />);
    await waitFor(() => expect(getNotifications()).toHaveLength(1));
    expect(getNotifications()[0].href).toBe("/me/badges?badge=attendance");
  });

  // A Pokémon badge shown under the generic tab reads as unearned, so the
  // link has to name the game as well.
  it("names the game when the badge belongs to one", async () => {
    localStorage.setItem("mc_badge_snapshot", JSON.stringify({ "champion::::pokemon": 0 }));
    state.badges = [
      { badgeId: "champion", count: 1, workspaceId: null, gameId: "pokemon" },
    ];
    render(<BadgeWatcher />);
    await waitFor(() => expect(getNotifications()).toHaveLength(1));
    expect(getNotifications()[0].href).toBe(
      "/me/badges?badge=champion&game=pokemon",
    );
  });
});
