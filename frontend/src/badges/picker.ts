import { TITLE_SLOT, equippableBadges, type EquippedSlot } from "./card";
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
 * The same mark twice in the badge row is not a loadout, it is a mistake
 * nobody meant to make, so a badge worn in another *icon* slot is left out.
 *
 * The title is a different question. Wearing a badge as your title and also
 * showing it is not a duplicate — one is a claim in words and the other is
 * the artwork — so the title slot and the icon row do not exclude each other.
 * Not forced, just not forbidden.
 *
 * Either way a badge stays listed for the slot it currently occupies, so
 * opening a filled slot shows what is in it rather than a list that
 * mysteriously omits the thing being looked at.
 */
export function slotOptions(
  earned: EarnedBadge[],
  gameId: string | null,
  equipped: EquippedSlot[],
  slot: number,
): SlotOption[] {
  const isTitle = slot === TITLE_SLOT;
  const takenElsewhere = new Set(
    equipped
      .filter((s) => s.slot !== slot && (s.slot === TITLE_SLOT) === isTitle)
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
 * slot *of the same kind* — moving a badge from icon slot 3 to icon slot 1 is
 * a move, not a copy. The title is left alone by a change to the icon row and
 * vice versa, because wearing the same badge as both is allowed.
 */
export function equipInSlot(
  equipped: EquippedSlot[],
  slot: number,
  option: { badgeId: string; workspaceId: string | null },
): EquippedSlot[] {
  const key = badgeKey(option.badgeId, option.workspaceId);
  const isTitle = slot === TITLE_SLOT;
  return [
    ...equipped.filter(
      (s) =>
        s.slot !== slot &&
        !(
          (s.slot === TITLE_SLOT) === isTitle &&
          badgeKey(s.badgeId, s.workspaceId) === key
        ),
    ),
    { slot, badgeId: option.badgeId, workspaceId: option.workspaceId },
  ].sort((a, b) => a.slot - b.slot);
}
