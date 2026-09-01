/**
 * Multi-game support — shared types.
 *
 * This module is deliberately free of JSX and of any import from the
 * tournament logic under utils/. The rules profiles it describes are consumed
 * by the pairing engine and the tie-break sorter, both of which are pure
 * modules under test; keeping the registry data-only means those tests can
 * import a profile without pulling React in.
 */

export type TournamentStructure = "swiss" | "round_robin" | "single_elimination";

/**
 * Numeric tiebreakers, compared highest-first. Head-to-head is not in this
 * list because it is not a value you can sort on — it is a post-pass that
 * only applies when exactly two players are still level (see RulesProfile).
 */
export type TiebreakerId =
  /** Opponents' match win %, Play! Pokémon §5.3.3 */
  | "omw"
  /** Opponents' opponents' match win % */
  | "oomw"
  /** Sum of opponents' match points — the classic chess/generic Swiss tiebreak */
  | "buchholz";

/**
 * How a tournament is scored and ranked. One profile per rule set, not per
 * game: two games that both follow the Play! Pokémon handbook would share one.
 *
 * There is no `points.bye` here on purpose. A bye is recorded as a win in the
 * standings builder, so its value is always `points.win`; a separate knob
 * would be a field that has to lie to stay consistent.
 */
export interface RulesProfile {
  id: string;
  label: string;
  points: { win: number; draw: number; loss: number };
  /** Applied in order, after match points, before head-to-head. */
  tiebreakers: TiebreakerId[];
  /**
   * Apply the head-to-head post-pass: where exactly two players remain level
   * on every numeric tiebreaker and they met during the event, the winner of
   * that match ranks higher.
   */
  headToHead: boolean;
  /** Bounds for a competitor's win %, which OMW%/OOMW% are averaged from. */
  winPct: {
    /** Lower bound. 0.25 under Play! Pokémon; 0 where no floor applies. */
    floor: number;
    /** Upper bound for players who dropped, or null for no special cap. */
    droppedCap: number | null;
    /** Whether byes are removed from the win % numerator and denominator. */
    excludeByes: boolean;
  };
  /** `best_of_3` shows a game-score entry; `match_only` records winner or draw. */
  scoring: "best_of_3" | "match_only";
  allowDraws: boolean;
}

export interface GameFormat {
  id: string;
  name: string;
  hint?: string;
}

export interface GameDefinition {
  id: string;
  /** Full name for headings and the join page. */
  name: string;
  /** Fits in a chip or a picker tile. */
  shortName: string;
  /**
   * `coming_soon` games appear in the picker but cannot be chosen. They exist
   * so the roadmap is visible without shipping half a rule set.
   */
  status: "available" | "coming_soon";
  /** Empty means this game has no format step in the create dialog. */
  formats: GameFormat[];
  structures: TournamentStructure[];
  /**
   * Which deck field players and organisers see.
   * `none` hides every deck surface: the join-page picker, the standings
   * column, and the deck panels on the stats page.
   */
  deck: "pokemon" | "text" | "none";
  rules: RulesProfile;
  /**
   * Month (1-12) a competitive season starts in. Pokémon runs September to
   * August; a game without a published season uses the calendar year, so the
   * stats period picker does not offer quarters that mean nothing.
   */
  season: { startMonth: number };
  /** Path under public/ for the picker tile icon. */
  iconSrc: string;
  /** Tile accent colour when selected. */
  accent: string;
  defaults: { structure: TournamentStructure; format?: string };
}
