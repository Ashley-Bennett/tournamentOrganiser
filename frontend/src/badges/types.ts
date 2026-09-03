/**
 * Badges — shared types.
 *
 * Data-only, like games/types.ts: no JSX, no imports from utils/, so the tier
 * maths can be tested without pulling React in.
 *
 * Definitions live in the frontend rather than the database because they are
 * static. The wire carries a badge id and a count; the client renders the
 * title, explanation, container and colour. That keeps the pairing board's
 * payload small — thirty-two players' badges cost a handful of integers — and
 * means adding a badge is a code change rather than a migration.
 */

/**
 * The five rungs, low to high. Each is a shape as well as a colour, so the tier
 * survives at 26px on a projector where colour alone would not.
 *
 * There is no copper: it was the weakest pair against bronze on both hue and
 * silhouette, and a rung you have to squint at is worse than one fewer rung.
 */
export type TierId = "white" | "bronze" | "silver" | "gold" | "diamond";

export type ContainerShape =
  | "circle"
  | "hexagon"
  | "shield"
  | "star"
  | "rhombus"
  /** Untiered badges sit outside the ladder entirely. */
  | "plaque";

export interface Tier {
  id: TierId;
  label: string;
  shape: ContainerShape;
  /** Starting values. The designer may return a different ramp. */
  hex: string;
}

/** Where a badge came from, which decides its rim treatment. */
export type Provenance = "system" | "league" | "closed";

export type Rarity = "common" | "uncommon" | "rare" | "mythic";

/**
 * What a badge is counting, when it is tiered.
 *
 * Every launch badge is a pure function of tournament history, so none of them
 * need a grant table or a reconcile pass — the count is derived on read and
 * cannot drift. Stored grants only become necessary for badges history cannot
 * describe: closed-set cohorts and anything an organiser mints by hand.
 */
export type BadgeMetric =
  /** Events finished at one league. */
  | "events_at_league"
  /** Events finished in the top cut. */
  | "top_cuts"
  /** Events won. */
  | "event_wins"
  /** Not counted — earned or not. */
  | "none";

export interface BadgeDefinition {
  id: string;
  /**
   * The badge's name in the badge case, and the worn title for a badge whose
   * wording does not change with the tier.
   */
  title: string;
  /**
   * Worn titles per rung, lowest first, for a badge whose wording climbs with
   * it — an Attendee becomes a Regular becomes an Institution.
   *
   * One entry per threshold. This is where the flavour that a bare counter
   * loses comes back: one badge whose name evolves, rather than five badges
   * that mean the same thing at different sizes.
   */
  tierTitles?: string[];
  /**
   * The grey line under the name. A noun phrase, six words at most, so one
   * string reads as an instruction while locked and a description once worn.
   */
  explanation: string;
  provenance: Provenance;
  rarity: Rarity;
  metric: BadgeMetric;
  /**
   * Ascending thresholds, one per tier, for a tiered badge. Empty for an
   * untiered one, which always renders in the plaque container.
   */
  thresholds: number[];
  /**
   * Minimum field size for the badge to be earnable. Top eight of a nine
   * player event is attendance with extra steps.
   */
  minFieldSize?: number;
  /** True when the badge is scoped to one league and shown with its name. */
  perLeague: boolean;
  /**
   * True when the badge is a claim about how you played a particular game,
   * and so must not be shown at an event for a different one — a Champion of
   * a chess evening says nothing about Pokémon.
   *
   * False for badges that describe the club rather than the play. Attendance
   * is the same fact whichever night you turn up on.
   */
  perGame: boolean;
}

/** A badge a player holds, as it comes over the wire. */
export interface EarnedBadge {
  badgeId: string;
  /** How many times, for a tiered badge. 1 for an untiered one. */
  count: number;
  /** Set only for a per-league badge. */
  workspaceId?: string | null;
  workspaceName?: string | null;
  /**
   * The game it was earned in. Null means it shows anywhere, which is how a
   * game-agnostic badge travels between a chess night and a Pokémon one.
   */
  gameId?: string | null;
  /**
   * The date of every qualifying event, ascending. The database stores these
   * rather than tier dates because it does not know that 25 events makes you
   * a Regular — so the client reads the 25th entry to say when Silver was
   * reached.
   */
  earnedAt?: string[];
}
