import { resolveBadge, tierFor } from "./tiers";
import { getBadge } from "./registry";
import type { BadgeDefinition, EarnedBadge, Tier } from "./types";

/**
 * Spotting what a player has just earned.
 *
 * This is the client's half of the unlock, and it has to be the client's half:
 * the thresholds that turn 25 events into "Regular" live in the frontend
 * registry, so only this side can tell a promotion from a count going up. The
 * database can see that somebody now holds a badge they never held before —
 * that is what the push after an event uses — but it cannot see a rung being
 * crossed without becoming a second place to keep the ladder right.
 *
 * So: the server keeps the counts correct, and this works out what that means.
 */

/**
 * The counts a player was last seen holding, keyed by the thing being counted.
 *
 * Attendance at two clubs is two entries, and a top cut in chess is not a top
 * cut in Pokémon, so the key carries the league and the game as well as the
 * badge.
 */
export type BadgeSnapshot = Record<string, number>;

export function snapshotKey(earned: EarnedBadge): string {
  return [
    earned.badgeId,
    earned.workspaceId ?? "",
    earned.gameId ?? "",
  ].join("::");
}

export function snapshotOf(earned: EarnedBadge[]): BadgeSnapshot {
  const snap: BadgeSnapshot = {};
  for (const e of earned) snap[snapshotKey(e)] = e.count;
  return snap;
}

export interface Unlock {
  /** Stable across re-derivation, so the same unlock is never raised twice. */
  key: string;
  /** "earned" the first time it is held at all; "promoted" for a new rung. */
  kind: "earned" | "promoted";
  badge: BadgeDefinition;
  tier: Tier | null;
  count: number;
  /**
   * The game it was earned in, or null for one that travels everywhere.
   *
   * Carried so a notification can land on the right tab of the badge case: a
   * Pokémon top cut shown under the generic tab reads as unearned.
   */
  gameId: string | null;
  /** With the league name, where the badge carries one. */
  label: string;
}

/**
 * What the bell says. Deliberately short — it sits in a list, not a page.
 *
 * A badge whose wording climbs can carry the promotion on its own: going from
 * Familiar Face to Regular says what happened. One with a single name cannot —
 * "You are now Top Cut" is a promotion announcing something the player already
 * was — so those name the rung instead.
 */
export function unlockMessage(unlock: Unlock): string {
  if (unlock.kind === "earned") return `You earned ${unlock.label}`;
  if (unlock.badge.tierTitles) return `You are now ${unlock.label}`;
  return `Your ${unlock.label} reached ${unlock.tier?.label ?? "a new rank"}`;
}

/**
 * What changed between the last look and now.
 *
 * Two things count as news, and a third deliberately does not:
 *
 *   - holding a badge that was not held at all before;
 *   - crossing onto a new rung of one already held;
 *   - a count going up *within* a rung, which is not news. Turning up to your
 *     sixth event when Regular is at 25 has not changed anything a player
 *     would want interrupting for.
 *
 * A count that has gone *down* — an event deleted, a merge undone — raises
 * nothing. Telling somebody they have lost a badge is a notification nobody
 * needs and cannot act on.
 */
export function unlocksBetween(
  previous: BadgeSnapshot,
  earned: EarnedBadge[],
): Unlock[] {
  const out: Unlock[] = [];

  for (const e of earned) {
    const badge = getBadge(e.badgeId);
    if (!badge || e.count <= 0) continue;

    const key = snapshotKey(e);
    const before = previous[key];
    const resolved = resolveBadge(e);
    if (!resolved) continue;

    // A tiered badge below its first threshold is progress, not a holding.
    if (badge.thresholds.length > 0 && resolved.tier === null) continue;

    if (before === undefined) {
      out.push({
        key,
        kind: "earned",
        badge,
        tier: resolved.tier,
        count: e.count,
        gameId: e.gameId ?? null,
        label: resolved.label,
      });
      continue;
    }

    if (e.count <= before) continue;

    const wasTier = tierFor(badge, before);
    const nowTier = resolved.tier;
    // An untiered badge has no rung to climb, so a rise in its count — which
    // should not happen — is not a promotion.
    if (!nowTier || wasTier?.id === nowTier.id) continue;

    // A badge whose first rung is only reached now reads as newly earned
    // rather than promoted: there was nothing to be promoted from.
    out.push({
      key,
      kind: wasTier === null ? "earned" : "promoted",
      badge,
      tier: nowTier,
      count: e.count,
      gameId: e.gameId ?? null,
      label: resolved.label,
    });
  }

  return out;
}
