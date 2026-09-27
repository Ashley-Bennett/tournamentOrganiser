// ── Per-device notification preferences ──────────────────────────────────────
// Device-scoped rather than account-scoped, for the same reason as the
// notification store: most players are device_token identities with no account,
// and push subscriptions belong to a browser, not to a person.
//
// NOTE: the storage key must NOT start with "tj_" — playerStorage.getAllEntries
// treats every such key as a joined-tournament entry.

const PREFS_KEY = "mc_notification_prefs";

export interface NotificationPrefs {
  /** In-app banner, vibration and tab-title flash while MatchAmp is open. */
  popups: boolean;
  /**
   * False once the player has switched push off here. Browsers do not let a
   * page revoke its own permission, so "granted" alone no longer means push is
   * wanted — this is the part the player controls.
   */
  push: boolean;
}

const DEFAULTS: NotificationPrefs = { popups: true, push: true };

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribePrefs(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === PREFS_KEY) listeners.forEach((fn) => fn());
  });
}

export function getPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      popups: typeof parsed.popups === "boolean" ? parsed.popups : DEFAULTS.popups,
      push: typeof parsed.push === "boolean" ? parsed.push : DEFAULTS.push,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(patch: Partial<NotificationPrefs>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getPrefs(), ...patch }));
  } catch {
    // Private mode or quota — the toggle just won't stick.
  }
  listeners.forEach((fn) => fn());
}

/**
 * Whether the OS will announce events itself, so the in-app banner would only
 * double up. Needs both the browser's permission and the player not having
 * switched push off here.
 */
export function pushDelivers(): boolean {
  return (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    getPrefs().push
  );
}
