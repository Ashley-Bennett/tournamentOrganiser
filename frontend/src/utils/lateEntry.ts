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
    return `Round ${currentRound} is already under way. You'll be counted as having lost the earlier rounds, and you'll either be paired with whoever is currently sitting out or get a bye for this round — then you're in the draw properly from round ${currentRound + 1}.`;
  }
  return `Round ${currentRound} hasn't started yet. You'll be counted as having lost the earlier rounds, then join the draw for round ${currentRound}.`;
}
