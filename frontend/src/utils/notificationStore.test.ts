import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addNotification,
  clearAll,
  clearTournament,
  getNotifications,
  markAllRead,
  markRead,
  notificationId,
  resolveNotification,
  subscribe,
  unreadCount,
  type NewNotification,
} from "./notificationStore";

const roundUp = (
  overrides: Partial<NewNotification> = {},
): NewNotification => ({
  type: "round_published",
  tournamentId: "t1",
  tournamentName: "Thursday Locals",
  message: "Round 2 is up. Table 3 vs Marcus",
  href: "/t/t1/me",
  roundNumber: 2,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe("notificationId", () => {
  it("includes the round when there is one", () => {
    expect(notificationId("t1", "round_published", 2)).toBe(
      "t1:round_published:2",
    );
  });

  it("omits the round for tournament-level events", () => {
    expect(notificationId("t1", "tournament_completed")).toBe(
      "t1:tournament_completed",
    );
  });
});

describe("addNotification", () => {
  it("stores an event and returns it", () => {
    const stored = addNotification(roundUp());
    expect(stored?.id).toBe("t1:round_published:2");
    expect(stored?.readAt).toBeNull();
    expect(stored?.source).toBe("local");
    expect(getNotifications()).toHaveLength(1);
  });

  // The watcher re-derives from scratch on every poll and every mount, so the
  // same event arrives repeatedly. It must not stack up.
  it("returns null and stores nothing for a repeat of the same event", () => {
    addNotification(roundUp());
    expect(addNotification(roundUp())).toBeNull();
    expect(getNotifications()).toHaveLength(1);
  });

  it("treats a different round as a different event", () => {
    addNotification(roundUp({ roundNumber: 2 }));
    addNotification(roundUp({ roundNumber: 3 }));
    expect(getNotifications()).toHaveLength(2);
  });

  it("treats the same round in another tournament as a different event", () => {
    addNotification(roundUp({ tournamentId: "t1" }));
    addNotification(roundUp({ tournamentId: "t2" }));
    expect(getNotifications()).toHaveLength(2);
  });

  it("survives a reload — the store is what persists, not component state", () => {
    addNotification(roundUp());
    // getNotifications reads localStorage fresh, as a new page load would.
    expect(getNotifications()[0]?.message).toBe(
      "Round 2 is up. Table 3 vs Marcus",
    );
  });

  it("keeps only the newest 50", () => {
    const t0 = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 60; i++) {
      addNotification(roundUp({ roundNumber: i }), t0 + i * 1000);
    }
    const all = getNotifications(t0 + 60_000);
    expect(all).toHaveLength(50);
    expect(all[0]?.id).toBe("t1:round_published:59");
  });
});

describe("expiry", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("drops entries older than 30 days on read", () => {
    const then = Date.UTC(2026, 0, 1);
    addNotification(roundUp({ roundNumber: 1 }), then);
    addNotification(roundUp({ roundNumber: 2 }), then + 29 * DAY);

    const now = then + 31 * DAY;
    const ids = getNotifications(now).map((n) => n.id);
    expect(ids).toEqual(["t1:round_published:2"]);
  });

  // An expired event must not block its own id from being raised again.
  it("lets an expired event be recorded afresh", () => {
    const then = Date.UTC(2026, 0, 1);
    addNotification(roundUp(), then);
    expect(addNotification(roundUp(), then + 31 * DAY)).not.toBeNull();
    expect(getNotifications(then + 31 * DAY)).toHaveLength(1);
  });
});

describe("read state", () => {
  it("counts only unread", () => {
    const a = addNotification(roundUp({ roundNumber: 1 }));
    addNotification(roundUp({ roundNumber: 2 }));
    expect(unreadCount()).toBe(2);

    markRead(a!.id);
    expect(unreadCount()).toBe(1);
  });

  it("marks everything read at once", () => {
    addNotification(roundUp({ roundNumber: 1 }));
    addNotification(roundUp({ roundNumber: 2 }));
    markAllRead();
    expect(unreadCount()).toBe(0);
  });

  it("ignores an unknown id", () => {
    addNotification(roundUp());
    markRead("nope");
    expect(unreadCount()).toBe(1);
  });
});

describe("resolving", () => {
  const needsResult = (): NewNotification => ({
    type: "result_needed",
    tournamentId: "t1",
    tournamentName: "Thursday Locals",
    message: "Round 2 needs your result",
    href: "/t/t1/me",
    roundNumber: 2,
  });

  it("removes a prompt once it has been actioned", () => {
    const stored = addNotification(needsResult());
    resolveNotification(stored!.id);
    expect(getNotifications()).toEqual([]);
  });

  it("leaves other notifications alone", () => {
    addNotification(roundUp());
    const stored = addNotification(needsResult());
    resolveNotification(stored!.id);
    expect(getNotifications().map((n) => n.type)).toEqual(["round_published"]);
  });

  it("is a no-op for an id that is not there", () => {
    addNotification(roundUp());
    resolveNotification("t1:result_needed:99");
    expect(getNotifications()).toHaveLength(1);
  });

  it("drops the unread count with it", () => {
    const stored = addNotification(needsResult());
    expect(unreadCount()).toBe(1);
    resolveNotification(stored!.id);
    expect(unreadCount()).toBe(0);
  });

  // Resolving must not permanently block the id — the next round can raise its
  // own prompt, and a re-paired round could legitimately raise the same one.
  it("lets the same event be raised again afterwards", () => {
    const stored = addNotification(needsResult());
    resolveNotification(stored!.id);
    expect(addNotification(needsResult())).not.toBeNull();
  });
});

describe("clearing", () => {
  it("drops one tournament and leaves the rest", () => {
    addNotification(roundUp({ tournamentId: "t1" }));
    addNotification(roundUp({ tournamentId: "t2" }));
    clearTournament("t1");
    expect(getNotifications().map((n) => n.tournamentId)).toEqual(["t2"]);
  });

  it("empties the store", () => {
    addNotification(roundUp());
    clearAll();
    expect(getNotifications()).toEqual([]);
  });
});

describe("resilience", () => {
  it("resets to empty when the store is corrupt", () => {
    localStorage.setItem("mc_notifications", "{not json");
    expect(getNotifications()).toEqual([]);
    expect(addNotification(roundUp())).not.toBeNull();
  });

  it("discards entries that are not notifications", () => {
    localStorage.setItem("mc_notifications", JSON.stringify([{ nope: 1 }, null]));
    expect(getNotifications()).toEqual([]);
  });

  // playerStorage.getAllEntries() treats every "tj_"-prefixed key as a joined
  // tournament, so the notification store must stay out of that namespace.
  it("does not use the tj_ key prefix", () => {
    addNotification(roundUp());
    const keys = Object.keys(localStorage);
    expect(keys).toContain("mc_notifications");
    expect(keys.some((k) => k.startsWith("tj_"))).toBe(false);
  });
});

describe("subscribe", () => {
  it("fires on write and stops after unsubscribe", () => {
    const fn = vi.fn();
    const off = subscribe(fn);

    addNotification(roundUp());
    expect(fn).toHaveBeenCalledTimes(1);

    off();
    addNotification(roundUp({ roundNumber: 9 }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fire when a duplicate is rejected", () => {
    addNotification(roundUp());
    const fn = vi.fn();
    const off = subscribe(fn);
    addNotification(roundUp());
    expect(fn).not.toHaveBeenCalled();
    off();
  });
});
