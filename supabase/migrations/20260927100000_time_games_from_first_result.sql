-- ─────────────────────────────────────────────────────────────────────────────
-- Time games from when the result was first entered, not when it was confirmed
--
-- result_recorded_at was stamped when a match's status became 'completed'. But
-- neither a player's report (submit_match_result) nor the desk entering a result
-- completes the match: both only write temp_result, and the match stays pending
-- until the organiser clicks Next Round / Complete Tournament, which saves every
-- pending result in one go. So every game in a round was stamped at the moment
-- the round closed, and every "typical game", "fastest game" and player pace
-- figure read as roughly the length of the whole round.
--
-- The trigger now stamps result_recorded_at as soon as a result first appears
-- in temp_result, and still stamps on completion for anything that skips the
-- pending step. It is cleared if a pending result is withdrawn (temp_result set
-- back to NULL without completing), so a wrongly-entered result does not pin a
-- game's end time to the mistake. Once completed it never moves, as before.
--
-- No reader changes: every timing RPC already uses result_recorded_at.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_result_recorded_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Byes are deliberately excluded: nobody played, so a duration would be
  -- meaningless and would drag every average down.
  IF NEW.status = 'completed' THEN
    IF NEW.result_recorded_at IS NULL
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
    THEN
      NEW.result_recorded_at := now();
    END IF;
  ELSIF NEW.temp_result IS NOT NULL THEN
    -- A player reported, or the desk entered, a result: the game is over.
    IF NEW.result_recorded_at IS NULL THEN
      NEW.result_recorded_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.temp_result IS NOT NULL THEN
    -- Pending result withdrawn before it was confirmed.
    NEW.result_recorded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.tournament_matches.result_recorded_at IS
  'When this match''s result was first entered (player report or desk entry), or completed if it skipped the pending step. Never moved once the match is completed. NULL for matches that predate 2026-09-01.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill from the audit log
--
-- tournament_matches is audited with full rows, so the moment temp_result first
-- went from NULL to a value is recoverable for every match already timed. Only
-- ever moves a stamp earlier, and never before its round began — a stamp before
-- the round start would drop the game out of the timings altogether.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.tournament_matches tm
   SET result_recorded_at = f.first_entered_at
  FROM (
    SELECT a.record_id, MIN(a.changed_at) AS first_entered_at
    FROM public.audit_log a
    WHERE a.table_name = 'tournament_matches'
      AND a.operation  = 'UPDATE'
      AND a.new_data ->> 'temp_result' IS NOT NULL
      AND a.old_data ->> 'temp_result' IS NULL
    GROUP BY a.record_id
  ) f,
  public.tournament_rounds tr
 WHERE f.record_id = tm.id
   AND tr.tournament_id = tm.tournament_id
   AND tr.round_number  = tm.round_number
   AND tm.status = 'completed'
   AND tm.result_recorded_at IS NOT NULL
   AND f.first_entered_at <  tm.result_recorded_at
   AND f.first_entered_at >= tr.started_at;
