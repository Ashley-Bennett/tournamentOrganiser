import { useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";
import { useMyBadges } from "../hooks/useMyBadges";
import {
  snapshotOf,
  unlockMessage,
  unlocksBetween,
  type BadgeSnapshot,
} from "../badges/unlocks";
import { ACCOUNT_SCOPE, addNotification } from "../utils/notificationStore";

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

const SNAPSHOT_KEY = "mc_badge_snapshot";

function readSnapshot(): BadgeSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
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

function writeSnapshot(snapshot: BadgeSnapshot) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private-mode failures are not worth breaking anything over.
    // The cost is re-deriving next time, and addNotification is idempotent.
  }
}

export default function BadgeWatcher() {
  const { user } = useAuth();
  // `ready` rather than `!loading`: the hook reports "not loading" over an
  // empty list in the window between the session arriving and the fetch
  // starting, and seeding a snapshot from that would make every badge the
  // player already holds look brand new on their next visit.
  const { badges, ready } = useMyBadges(!!user);
  // One pass per set of badges, not one per render.
  const donePass = useRef(false);

  useEffect(() => {
    if (!user) {
      donePass.current = false;
      return;
    }
    if (!ready || donePass.current) return;
    donePass.current = true;

    const now = snapshotOf(badges);
    const previous = readSnapshot();

    // First run seeds silently. A player who has been coming for a year does
    // not want a bell full of things they earned months ago the first time
    // this ships — and the badges are all still there on the wall.
    if (previous === null) {
      writeSnapshot(now);
      return;
    }

    for (const unlock of unlocksBetween(previous, badges)) {
      addNotification({
        type: unlock.kind === "earned" ? "badge_earned" : "badge_promoted",
        tournamentId: ACCOUNT_SCOPE,
        tournamentName: null,
        message: unlockMessage(unlock),
        href: "/me/badges",
        // The rung is part of the key, so reaching Silver raises one
        // notification and staying on Silver raises none.
        idKey: `${unlock.key}:${unlock.tier?.id ?? "none"}`,
        source: "server",
      });
    }

    writeSnapshot(now);
  }, [user, badges, ready]);

  return null;
}
