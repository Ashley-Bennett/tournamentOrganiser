import { equippableBadges, type EquippedSlot } from "./card";
import { resolveBadge, sortForDisplay } from "./tiers";
import type { BadgeDefinition, EarnedBadge, Tier } from "./types";

/**
 * What a slot may be filled with.
 *
 * Kept apart from the dialog so the rules are testable without a DOM, and so
 * the answer to "may I wear this" has one home rather than being re-derived
 * wherever a picker happens to open.
 */

/**
 * A badge is identified by what it is *and* where it was earned: Regular at
 * two clubs is two different things to wear, and a list keyed on the badge id
 * alone would silently collapse them into one.
 */
export const KEY_SEPARATOR = "::";

export function badgeKey(
  badgeId: string,
  workspaceId: string | null | undefined,
): string {
  return `${badgeId}${KEY_SEPARATOR}${workspaceId ?? ""}`;
}

export function parseBadgeKey(key: string): {
  badgeId: string;
  workspaceId: string | null;
} {
  const at = key.indexOf(KEY_SEPARATOR);
  if (at === -1) return { badgeId: key, workspaceId: null };
  const workspaceId = key.slice(at + KEY_SEPARATOR.length);
  return { badgeId: key.slice(0, at), workspaceId: workspaceId || null };
}

export interface SlotOption {
  key: string;
  badgeId: string;
  workspaceId: string | null;
  badge: BadgeDefinition;
  tier: Tier | null;
  count: number;
  /** The worn title at this rung. */
  title: string;
  /** With the league name, where the badge carries one. */
  label: string;
}

/**
 * The badges offered for one slot, best first.
 *
 * A badge already worn in a *different* slot is left out — the same mark
 * three times is not a loadout, it is a mistake nobody meant to make. It is
 * kept in the list for the slot it currently occupies, so opening a filled
 * slot shows what is in it rather than a list that mysteriously omits it.
 */
export function slotOptions(
  earned: EarnedBadge[],
  gameId: string | null,
  equipped: EquippedSlot[],
  slot: number,
): SlotOption[] {
  const takenElsewhere = new Set(
    equipped
      .filter((s) => s.slot !== slot)
      .map((s) => badgeKey(s.badgeId, s.workspaceId)),
  );

  return sortForDisplay(equippableBadges(earned, gameId))
    .flatMap((e) => {
      const resolved = resolveBadge(e);
      if (!resolved) return [];
      return [
        {
          key: badgeKey(e.badgeId, e.workspaceId),
          badgeId: e.badgeId,
          workspaceId: e.workspaceId ?? null,
          badge: resolved.badge,
          tier: resolved.tier,
          count: resolved.count,
          title: resolved.title,
          label: resolved.label,
        },
      ];
    })
    .filter((o) => !takenElsewhere.has(o.key));
}

/**
 * Put a badge in a slot, returning the whole loadout.
 *
 * Replaces whatever was in that slot, and takes the badge out of any other
 * slot it was sitting in — moving a badge from slot 3 to slot 1 is a move,
 * not a copy, and leaving the original behind would duplicate it.
 */
export function equipInSlot(
  equipped: EquippedSlot[],
  slot: number,
  option: { badgeId: string; workspaceId: string | null },
): EquippedSlot[] {
  const key = badgeKey(option.badgeId, option.workspaceId);
  return [
    ...equipped.filter(
      (s) => s.slot !== slot && badgeKey(s.badgeId, s.workspaceId) !== key,
    ),
    { slot, badgeId: option.badgeId, workspaceId: option.workspaceId },
  ].sort((a, b) => a.slot - b.slot);
}
