-- ── add_conflict_to_confirmed_by_check ───────────────────────────────────────
-- The submit_match_result function sets confirmed_by = 'conflict' when both
-- players submit disagreeing outcomes, but 'conflict' was never added to the
-- check constraint. This caused a constraint violation on any win/win or
-- loss/loss report combination.

ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_confirmed_by_check;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_confirmed_by_check
    CHECK (confirmed_by IN ('organiser', 'player_agreement', 'player_report', 'conflict'));
