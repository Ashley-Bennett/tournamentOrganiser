import { TIERS, getBadge, isTiered } from "./registry";
import type { BadgeDefinition, EarnedBadge, Tier } from "./types";

/**
 * Resolving a count to a tier.
 *
 * The tier is derived from the count rather than granted separately, which is
 * what stops it going stale or double-awarding: there is one number, and the
 * rung is a function of it.
 */

/**
 * The highest rung whose threshold the count has reached, or null when the
 * badge has not been earned at all.
 *
 * An untiered badge has no rungs, so it resolves to null however high the
 * count is — callers use `isTiered` to decide whether to ask.
 */
export function tierFor(
  badge: BadgeDefinition,
  count: number,
): Tier | null {
  if (!isTiered(badge)) return null;

  let reached: Tier | null = null;
  badge.thresholds.forEach((threshold, i) => {
    if (count >= threshold && TIERS[i]) reached = TIERS[i];
  });
  return reached;
}

/** How many more are needed for the next rung, or null when it is maxed. */
export function toNextTier(
  badge: BadgeDefinition,
  count: number,
): { needed: number; tier: Tier } | null {
  if (!isTiered(badge)) return null;

  for (let i = 0; i < badge.thresholds.length; i++) {
    const threshold = badge.thresholds[i];
    const tier = TIERS[i];
    if (tier && count < threshold) {
      return { needed: threshold - count, tier };
    }
  }
  return null;
}

/**
 * The worn title at a given count.
 *
 * A badge whose wording climbs uses the title for the rung reached; everything
 * else uses its one name. An unearned badge falls back to the catalogue name,
 * so a locked row in the badge case reads as the thing rather than as its
 * first rung.
 */
export function titleFor(badge: BadgeDefinition, count: number): string {
  if (!badge.tierTitles) return badge.title;
  const tier = tierFor(badge, count);
  if (!tier) return badge.title;
  const index = TIERS.findIndex((t) => t.id === tier.id);
  return badge.tierTitles[index] ?? badge.title;
}

/**
 * Everything the card needs to draw one badge, resolved from the wire shape.
 *
 * Returns null for an unknown id rather than throwing: a client that has not
 * been redeployed yet will meet badges it does not know about, and one
 * unrecognised entry must not take the pairing board down.
 */
export function resolveBadge(earned: EarnedBadge): {
  badge: BadgeDefinition;
  tier: Tier | null;
  count: number;
  /** The worn title at this rung, without attribution. */
  title: string;
  /** The title as shown, with a league name where the badge carries one. */
  label: string;
} | null {
  const badge = getBadge(earned.badgeId);
  if (!badge) return null;

  const tier = tierFor(badge, earned.count);
  const title = titleFor(badge, earned.count);
  const label =
    badge.perLeague && earned.workspaceName
      ? `${title} · ${earned.workspaceName}`
      : title;

  return { badge, tier, count: earned.count, title, label };
}

/**
 * Sorts a player's badges for display, best first.
 *
 * Rarity leads, because a mythic is the thing worth seeing on a card that only
 * shows three. Tier breaks ties within a rarity, then the count.
 */
const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"] as const;

export function sortForDisplay(earned: EarnedBadge[]): EarnedBadge[] {
  const rank = (e: EarnedBadge): [number, number, number] => {
    const badge = getBadge(e.badgeId);
    if (!badge) return [99, 99, 0];
    const rarity = RARITY_ORDER.indexOf(
      badge.rarity as (typeof RARITY_ORDER)[number],
    );
    const tier = tierFor(badge, e.count);
    const tierIndex = tier ? TIERS.findIndex((t) => t.id === tier.id) : -1;
    return [rarity, -tierIndex, -e.count];
  };

  return [...earned].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });
}

/**
 * The badges that may be shown at an event for `gameId`.
 *
 * A badge with no game travels everywhere; one earned in another game is kept
 * but hidden, because it is a claim about a game nobody in this room is
 * playing. Passing null for the game — an account page with no event in
 * context — shows everything.
 */
export function badgesForGame(
  earned: EarnedBadge[],
  gameId: string | null,
): EarnedBadge[] {
  if (gameId === null) return earned;
  return earned.filter((e) => {
    const badge = getBadge(e.badgeId);
    if (!badge) return false;
    if (!badge.perGame) return true;
    return e.gameId === gameId;
  });
}
