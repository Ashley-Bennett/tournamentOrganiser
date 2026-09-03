import { partnerImage } from "../games/partners";
import { getBadge } from "./registry";
import { badgesForGame, resolveBadge, tierFor } from "./tiers";
import type { BadgeDefinition, EarnedBadge, Tier } from "./types";

/**
 * Turning saved rows into the one object a card draws.
 *
 * Two callers produce the same shape from different places: the pairing board
 * gets slots with counts already attached (get_tournament_player_cards), and
 * your own account joins your equipped slots to your saved badges. Assembling
 * in one function keeps the board and the account page from disagreeing about
 * what your card looks like.
 *
 * Nothing here throws. A card is chrome around somebody's name in a room full
 * of people — a badge that no longer resolves is dropped, and the name still
 * renders.
 */

/** Slot 0 is the worn title; 1-3 are badge icons, left to right. */
export const TITLE_SLOT = 0;
export const MAX_BADGE_SLOTS = 3;

/** One equipped slot, as stored and as sent to the board. */
export interface CardSlot {
  slot: number;
  badgeId: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  count: number;
}

/** One resolved badge, ready to draw. */
export interface CardBadge {
  badge: BadgeDefinition;
  tier: Tier | null;
  count: number;
  /** The worn title at this rung, without attribution. */
  title: string;
  /** With the league name, where the badge carries one. */
  label: string;
  workspaceName: string | null;
}

export interface PlayerCard {
  gameId: string | null;
  /** Null when the game has no partner, or nothing resolves. */
  partnerImage: string | null;
  /** Null when no title is equipped, which renders as nothing at all. */
  title: CardBadge | null;
  /** Up to three, in slot order. */
  badges: CardBadge[];
}

function toCardBadge(slot: CardSlot): CardBadge | null {
  const resolved = resolveBadge({
    badgeId: slot.badgeId,
    count: slot.count,
    workspaceId: slot.workspaceId,
    workspaceName: slot.workspaceName,
  });
  if (!resolved) return null;

  // A tiered badge nobody has actually reached the first rung of is not worn.
  // A count of zero means the slot outlived the history behind it.
  if (resolved.badge.thresholds.length > 0 && resolved.tier === null) {
    return null;
  }
  if (slot.count <= 0) return null;

  return {
    badge: resolved.badge,
    tier: resolved.tier,
    count: resolved.count,
    title: resolved.title,
    label: resolved.label,
    workspaceName: slot.workspaceName ?? null,
  };
}

export function assembleCard(input: {
  gameId: string | null;
  partnerKey: string | null;
  slots: CardSlot[];
}): PlayerCard {
  const title =
    input.slots
      .filter((s) => s.slot === TITLE_SLOT)
      .map(toCardBadge)
      .find((b): b is CardBadge => b !== null) ?? null;

  const badges = input.slots
    .filter((s) => s.slot !== TITLE_SLOT)
    .sort((a, b) => a.slot - b.slot)
    .map(toCardBadge)
    .filter((b): b is CardBadge => b !== null)
    .slice(0, MAX_BADGE_SLOTS);

  return {
    gameId: input.gameId,
    partnerImage: partnerImage(input.gameId, input.partnerKey),
    title,
    badges,
  };
}

/** True when the card has nothing on it but a partner. */
export function isBareCard(card: PlayerCard): boolean {
  return card.title === null && card.badges.length === 0;
}

// ── Choosing what to wear ────────────────────────────────────────────────────

/**
 * The badges a player may equip while playing `gameId`.
 *
 * Filtered the same way the card is, so the picker cannot offer something that
 * would then refuse to render — a chess Champion is not on the list at a
 * Pokémon event.
 */
export function equippableBadges(
  earned: EarnedBadge[],
  gameId: string | null,
): EarnedBadge[] {
  return badgesForGame(earned, gameId).filter((e) => {
    const badge = getBadge(e.badgeId);
    if (!badge || e.count <= 0) return false;
    // A tiered badge below its first threshold has not been earned yet.
    return badge.thresholds.length === 0 || tierFor(badge, e.count) !== null;
  });
}

/** Whether one specific badge may go in a slot right now. */
export function canEquip(
  earned: EarnedBadge[],
  gameId: string | null,
  badgeId: string,
  workspaceId: string | null = null,
): boolean {
  return equippableBadges(earned, gameId).some(
    (e) =>
      e.badgeId === badgeId &&
      (e.workspaceId ?? null) === workspaceId,
  );
}

// ── When did I get this? ─────────────────────────────────────────────────────

/**
 * The date a badge's current rung was reached, or null if it cannot be known.
 *
 * The database stores the date of every qualifying event rather than the tier
 * dates, because thresholds live here rather than there. Reaching Silver at 25
 * events means the 25th date is the answer — so this is the client half of a
 * deliberate split.
 *
 * Returns null when the dates were capped away, rather than guessing.
 */
export function tierReachedAt(
  badge: BadgeDefinition,
  earned: EarnedBadge,
): string | null {
  const dates = earned.earnedAt;
  if (!dates || dates.length === 0) return null;

  const tier = tierFor(badge, earned.count);
  if (!tier) return dates[0] ?? null;

  const index = badge.thresholds.findIndex((t) => t > earned.count);
  const threshold =
    index === -1
      ? badge.thresholds[badge.thresholds.length - 1]
      : badge.thresholds[index - 1];

  if (threshold === undefined) return null;
  return dates[threshold - 1] ?? null;
}

/** The date of the first qualifying event, or null when unknown. */
export function firstEarnedAt(earned: EarnedBadge): string | null {
  return earned.earnedAt?.[0] ?? null;
}

/** The date of the most recent qualifying event, or null when unknown. */
export function lastEarnedAt(earned: EarnedBadge): string | null {
  const dates = earned.earnedAt;
  return dates && dates.length > 0 ? dates[dates.length - 1] : null;
}
