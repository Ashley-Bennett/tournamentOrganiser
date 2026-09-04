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
 * Scoped twice over. To one game, because showing a chess player every Pokémon
 * badge they will never earn turns a catalogue into a list of ways they are
 * behind. And to one *source* — the badges that belong to a club, or the ones
 * that belong to nobody — because "Regular" means something different at each
 * club a player attends, and stacking them in one list makes the same badge
 * look like three.
 */

/**
 * Which slice of the catalogue is being looked at.
 *
 * The split is the catalogue's own `provenance`: a league badge is earned at
 * one club and carries its name, a system badge is the same wherever it
 * happened and carries none.
 */
export type CaseScope =
  | { kind: "system" }
  | { kind: "league"; workspaceId: string };

/** One club a player holds league badges at. */
export interface CaseLeague {
  workspaceId: string;
  name: string;
}

/**
 * The clubs to offer as tabs, from what the player actually holds.
 *
 * There is no other source: a player is not a member of the workspace they
 * play at, so their leagues are only knowable from the badges those events
 * awarded. Attendance starts at one event, so a club appears as soon as
 * somebody has finished a single tournament there.
 */
export function leaguesFrom(
  earned: EarnedBadge[],
  gameId: string | null,
): CaseLeague[] {
  const seen = new Map<string, string>();
  for (const e of badgesForGame(earned, gameId)) {
    if (!e.workspaceId) continue;
    if (!seen.has(e.workspaceId)) {
      seen.set(e.workspaceId, e.workspaceName ?? "Unnamed league");
    }
  }
  return [...seen.entries()]
    .map(([workspaceId, name]) => ({ workspaceId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
export function caseRows(
  earned: EarnedBadge[],
  gameId: string | null,
  scope: CaseScope = { kind: "system" },
): CaseRow[] {
  const inLeague = scope.kind === "league";
  const relevant = sortForDisplay(badgesForGame(earned, gameId)).filter((e) =>
    inLeague ? e.workspaceId === scope.workspaceId : !e.workspaceId,
  );

  const catalogue = BADGES.filter((b) =>
    inLeague ? b.provenance === "league" : b.provenance !== "league",
  );

  const rows = catalogue.map((badge): CaseRow => {
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
    return catalogue.indexOf(a.badge) - catalogue.indexOf(b.badge);
  });
}
