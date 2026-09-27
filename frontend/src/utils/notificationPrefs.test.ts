import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPrefs, pushDelivers, setPrefs, subscribePrefs } from "./notificationPrefs";

describe("notificationPrefs", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to everything on", () => {
    expect(getPrefs()).toEqual({ popups: true, push: true });
  });

  it("merges a partial update and notifies listeners", () => {
    const fn = vi.fn();
    const off = subscribePrefs(fn);
    setPrefs({ popups: false });
    expect(getPrefs()).toEqual({ popups: false, push: true });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("falls back to defaults on a corrupt value", () => {
    localStorage.setItem("mc_notification_prefs", "{not json");
    expect(getPrefs()).toEqual({ popups: true, push: true });
  });

  it("treats push as delivering only when granted and not switched off", () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    expect(pushDelivers()).toBe(true);
    setPrefs({ push: false });
    expect(pushDelivers()).toBe(false);

    vi.stubGlobal("Notification", { permission: "default" });
    setPrefs({ push: true });
    expect(pushDelivers()).toBe(false);
  });
});
