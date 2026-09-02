import type { NewNotification } from "./notificationStore";

/** One row of get_organiser_alert_state(). */
export interface OrganiserAlertRow {
  tournament_id: string;
  tournament_name: string;
  workspace_slug: string;
  round_number: number;
  total_matches: number;
  settled_matches: number;
  conflict_count: number;
}

/** What we remember between polls, so only transitions raise anything. */
export interface OrganiserBaseline {
  roundNumber: number;
  allIn: boolean;
  hasConflict: boolean;
}

export function baselineOf(row: OrganiserAlertRow): OrganiserBaseline {
  return {
    roundNumber: row.round_number,
    allIn: row.total_matches > 0 && row.settled_matches >= row.total_matches,
    hasConflict: row.conflict_count > 0,
  };
}

export function organiserHref(row: OrganiserAlertRow): string {
  return `/w/${row.workspace_slug}/tournaments/${row.tournament_id}/matches`;
}

export interface OrganiserDiff {
  raise: NewNotification[];
  /** Ids to drop because the thing they asked for has been dealt with. */
  resolve: Array<{ type: "result_conflict"; roundNumber: number }>;
}

/**
 * Works out what changed for one tournament since the last poll.
 *
 * `prev` is null on the very first observation, which seeds silently — an
 * organiser opening the app to a round that finished ten minutes ago does not
 * need to be told about it.
 *
 * A new round resets both signals: round 4 being incomplete says nothing about
 * round 3, and the round-3 notification stays in the list as history.
 */
export function organiserDiff(
  row: OrganiserAlertRow,
  prev: OrganiserBaseline | null,
): OrganiserDiff {
  const next = baselineOf(row);
  const diff: OrganiserDiff = { raise: [], resolve: [] };

  if (prev === null) return diff;

  const newRound = next.roundNumber !== prev.roundNumber;
  const wasAllIn = newRound ? false : prev.allIn;
  const hadConflict = newRound ? false : prev.hasConflict;

  const base = {
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    href: organiserHref(row),
    roundNumber: next.roundNumber,
  };

  if (next.allIn && !wasAllIn) {
    diff.raise.push({
      ...base,
      type: "results_all_in",
      message: `All results are in for Round ${next.roundNumber}. Ready to pair.`,
    });
  }

  if (next.hasConflict && !hadConflict) {
    const n = row.conflict_count;
    diff.raise.push({
      ...base,
      type: "result_conflict",
      message:
        n === 1
          ? `A result in Round ${next.roundNumber} needs a decision`
          : `${n} results in Round ${next.roundNumber} need a decision`,
    });
  }

  // Once the organiser has settled the disagreement the prompt is just noise.
  if (!next.hasConflict && hadConflict) {
    diff.resolve.push({
      type: "result_conflict",
      roundNumber: prev.roundNumber,
    });
  }

  return diff;
}
