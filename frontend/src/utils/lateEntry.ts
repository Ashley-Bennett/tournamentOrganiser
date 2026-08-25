/**
 * Player-facing explanation of what joining a tournament mid-event means for
 * them. Mirrors the branches in `apply_late_entry_pairing` so the promise made
 * on the join page matches what the server actually does.
 *
 * The organiser's own late-entry dialog has a richer version of this message —
 * it can name the specific player currently sitting on a bye, which the join
 * page has no business knowing.
 */
export function lateJoinMessage(
  currentRound: number,
  roundInProgress: boolean,
): string {
  if (roundInProgress) {
    return `Round ${currentRound} is already under way. Rounds you missed count as losses. If someone is currently sitting out you'll be paired with them; otherwise you sit out round ${currentRound} as a loss too — joining late never earns you a free win. You're in the draw properly from round ${currentRound + 1}.`;
  }
  return `Round ${currentRound} hasn't started yet. Rounds you missed count as losses. You'll be paired for round ${currentRound} if someone is available, otherwise you sit that round out as a loss and join the draw from round ${currentRound + 1}.`;
}
