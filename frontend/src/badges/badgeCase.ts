import { BADGES } from "./registry";
import { badgesForGame, sortForDisplay, tierFor, titleFor, toNextTier } from "./tiers";
import type { BadgeDefinition, EarnedBadge, Tier } from "./types";

/**
 * The badge case: every badge in the catalogue, held or not.
 *
 * The picker is for getting dressed and lists only what you own. This is the
 * other half — what exists, and how far off it is. Both are needed and they
 * are not the same screen: a list of things you cannot wear is information in
 * the case and an obstacle in the picker.
 *
 * Scoped to one game on purpose. Showing a chess player every Pokémon badge
 * they will never earn turns a catalogue into a list of ways they are behind.
 */

export interface CaseRow {
  badge: BadgeDefinition;
  /** Null when the badge is not held at all. */
  tier: Tier | null;
  count: number;
  held: boolean;
  /** The worn title at this rung, or the catalogue name when unearned. */
  title: string;
  /** With the league name, where one applies. */
  label: string;
  workspaceName: string | null;
  /** How many more for the next rung, and which. Null when maxed or untiered. */
  next: { needed: number; tier: Tier } | null;
}

/**
 * One row per badge in the catalogue, held ones first.
 *
 * A badge held at several leagues collapses to its best instance rather than
 * appearing three times: the case answers "do I have this, and how far along",
 * and three Regular rows at three clubs answers it three times over. The
 * picker is where the individual instances matter, because that is where the
 * difference between them decides what the card says.
 */
export function caseRows(earned: EarnedBadge[], gameId: string | null): CaseRow[] {
  const relevant = sortForDisplay(badgesForGame(earned, gameId));

  const rows = BADGES.map((badge): CaseRow => {
    // sortForDisplay already put the best first, so the first match is it.
    const best = relevant.find((e) => e.badgeId === badge.id);
    const count = best?.count ?? 0;
    const tier = best ? tierFor(badge, count) : null;

    // A tiered badge below its first threshold is progress, not a holding.
    const held = best !== undefined && (badge.thresholds.length === 0 || tier !== null);

    const title = held ? titleFor(badge, count) : badge.title;
    const workspaceName = held ? best?.workspaceName ?? null : null;

    return {
      badge,
      tier,
      count,
      held,
      title,
      label:
        badge.perLeague && workspaceName ? `${title} · ${workspaceName}` : title,
      workspaceName,
      next: toNextTier(badge, count),
    };
  });

  // Held first, then by how close the rest are — the next one to fall should
  // be the next one you see, not buried under things you have not started.
  return rows.sort((a, b) => {
    if (a.held !== b.held) return a.held ? -1 : 1;
    if (!a.held && !b.held) {
      const an = a.next?.needed ?? Infinity;
      const bn = b.next?.needed ?? Infinity;
      if (an !== bn) return an - bn;
    }
    return BADGES.indexOf(a.badge) - BADGES.indexOf(b.badge);
  });
}
