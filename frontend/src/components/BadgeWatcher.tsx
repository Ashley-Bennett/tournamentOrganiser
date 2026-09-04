import { useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";
import { useMyBadges } from "../hooks/useMyBadges";
import {
  snapshotOf,
  unlockMessage,
  unlocksBetween,
  type BadgeSnapshot,
} from "../badges/unlocks";
import {
  ACCOUNT_SCOPE,
  addNotification,
  clearAccountScoped,
} from "../utils/notificationStore";

/**
 * Raises a bell notification when the signed-in player's badges move.
 *
 * Mounted once at app level rather than on the account page, because the whole
 * point is to catch an unlock the player has not gone looking for. The server
 * recomputes badges when an event closes; this is what turns that into
 * something they see.
 *
 * Renders nothing. It is a side effect with a mounting point.
 */

/**
 * Per account, not per browser.
 *
 * One key for the whole device meant two people sharing a browser diffed
 * against each other's counts — the second to sign in would be told they had
 * earned whatever the first held. The id keeps them apart, and it is not a
 * secret: it is already in the session this code only runs inside.
 */
function snapshotKeyFor(userId: string) {
  return `mc_badge_snapshot:${userId}`;
}

/** The single unscoped key earlier builds wrote. Removed on sight. */
const LEGACY_SNAPSHOT_KEY = "mc_badge_snapshot";

function badgeHref(unlock: { badge: { id: string }; gameId: string | null }) {
  const params = new URLSearchParams({ badge: unlock.badge.id });
  if (unlock.gameId) params.set("game", unlock.gameId);
  return `/me/badges?${params.toString()}`;
}

function readSnapshot(userId: string): BadgeSnapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKeyFor(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    // Anything non-numeric is dropped rather than trusted: a corrupt entry
    // would otherwise compare as NaN and raise a promotion every load.
    const out: BadgeSnapshot = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    // A corrupt snapshot is treated as a first run: silent, not noisy.
    return null;
  }
}

function writeSnapshot(userId: string, snapshot: BadgeSnapshot) {
  try {
    localStorage.removeItem(LEGACY_SNAPSHOT_KEY);
    localStorage.setItem(snapshotKeyFor(userId), JSON.stringify(snapshot));
  } catch {
    // Quota or private-mode failures are not worth breaking anything over.
    // The cost is re-deriving next time, and addNotification is idempotent.
  }
}

export default function BadgeWatcher() {
  const { user, loading: authLoading } = useAuth();
  // `ready` rather than `!loading`: the hook reports "not loading" over an
  // empty list in the window between the session arriving and the fetch
  // starting, and seeding a snapshot from that would make every badge the
  // player already holds look brand new on their next visit.
  const { badges, ready } = useMyBadges(!!user);
  // One pass per set of badges, not one per render.
  const donePass = useRef(false);

  useEffect(() => {
    // The session takes a moment to rehydrate, and during it `user` is null.
    // Acting on that would wipe a signed-in player's notifications on every
    // page load.
    if (authLoading) return;

    if (!user) {
      donePass.current = false;
      // Signed out — by logging out, or by a session simply expiring. Either
      // way the account's notifications should not be sitting in the bell of
      // a device someone is using as an accountless player.
      clearAccountScoped();
      return;
    }
    if (!ready || donePass.current) return;
    donePass.current = true;

    const now = snapshotOf(badges);
    const previous = readSnapshot(user.id);

    // First run seeds silently. A player who has been coming for a year does
    // not want a bell full of things they earned months ago the first time
    // this ships — and the badges are all still there on the wall.
    if (previous === null) {
      writeSnapshot(user.id, now);
      return;
    }

    for (const unlock of unlocksBetween(previous, badges)) {
      addNotification({
        type: unlock.kind === "earned" ? "badge_earned" : "badge_promoted",
        tournamentId: ACCOUNT_SCOPE,
        tournamentName: null,
        message: unlockMessage(unlock),
        // Deep-linked, so tapping lands on the badge itself rather than on a
        // wall of thirty and a hunt for which one moved. The game picks the
        // tab: a Pokémon top cut under the generic tab reads as unearned.
        href: badgeHref(unlock),
        // The rung is part of the key, so reaching Silver raises one
        // notification and staying on Silver raises none.
        idKey: `${unlock.key}:${unlock.tier?.id ?? "none"}`,
        source: "server",
      });
    }

    writeSnapshot(user.id, now);
  }, [user, authLoading, badges, ready]);

  return null;
}
