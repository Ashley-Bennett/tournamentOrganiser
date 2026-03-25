-- ── player_report_sets_temp_result ───────────────────────────────────────────
-- When a player submits a result, also set temp_winner_id / temp_result on the
-- match row.  The organiser's "pending results" restore logic already reads
-- these fields (matches where status != completed and temp_result IS NOT NULL),
-- so setting them here replicates the same behaviour as the organiser clicking
-- a result chip themselves:
--
--   • allResultsEntered becomes true once every pending match has a temp_result
--   • The "Submit Results" button is enabled and the organiser can commit them
--   • The organiser can still override any individual result before saving
--
-- Also applies to the conflict case so the organiser sees a pre-filled result
-- they can correct before confirming.

CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match_id         UUID,
  p_player_id        UUID,
  p_device_token     TEXT,
  p_reported_outcome TEXT   -- 'win' | 'loss' | 'draw'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match           RECORD;
  v_other_player_id UUID;
  v_other_outcome   TEXT;
  v_winner_id       UUID;
  v_result_str      TEXT;
BEGIN
  IF p_reported_outcome NOT IN ('win', 'loss', 'draw') THEN
    RAISE EXCEPTION 'Invalid outcome: must be win, loss, or draw';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_player_id AND device_token = p_device_token
  ) THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  SELECT id, tournament_id, player1_id, player2_id, status
  INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.player1_id <> p_player_id AND v_match.player2_id <> p_player_id THEN
    RAISE EXCEPTION 'Player is not in this match';
  END IF;

  IF v_match.player2_id IS NULL THEN
    RAISE EXCEPTION 'Cannot submit result for a bye match';
  END IF;

  IF v_match.status IN ('completed', 'bye') THEN
    RAISE EXCEPTION 'Match is already completed';
  END IF;

  -- Upsert this player's report
  INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
  VALUES (p_match_id, p_player_id, p_reported_outcome)
  ON CONFLICT (match_id, player_id)
  DO UPDATE SET reported_outcome = EXCLUDED.reported_outcome,
                submitted_at     = now();

  v_other_player_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- Derive winner_id and result string from this player's reported outcome
  IF p_reported_outcome = 'draw' THEN
    v_winner_id  := NULL;
    v_result_str := 'Draw';
  ELSIF p_reported_outcome = 'win' THEN
    v_winner_id  := p_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '1-0' ELSE '0-1' END;
  ELSE -- 'loss'
    v_winner_id  := v_other_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;
  END IF;

  -- Check if the other player has submitted
  SELECT reported_outcome INTO v_other_outcome
  FROM public.match_result_reports
  WHERE match_id = p_match_id AND player_id = v_other_player_id;

  IF NOT FOUND THEN
    -- First submission: apply result and set temp fields so the organiser's
    -- "pending results" restore logic picks this up automatically (same as
    -- clicking a result chip in the organiser UI).
    UPDATE public.tournament_matches
    SET winner_id      = v_winner_id,
        result         = v_result_str,
        temp_winner_id = v_winner_id,
        temp_result    = v_result_str,
        confirmed_by   = 'player_report'
    WHERE id = p_match_id;
    RETURN jsonb_build_object('status', 'submitted');
  END IF;

  -- Both submitted — check for agreement
  IF (p_reported_outcome = 'win'  AND v_other_outcome = 'loss')
  OR (p_reported_outcome = 'loss' AND v_other_outcome = 'win')
  OR (p_reported_outcome = 'draw' AND v_other_outcome = 'draw')
  THEN
    -- Agreement: auto-complete; cleanup trigger will delete both reports
    UPDATE public.tournament_matches
    SET winner_id      = v_winner_id,
        result         = v_result_str,
        status         = 'completed',
        confirmed_by   = 'player_agreement',
        temp_winner_id = NULL,
        temp_result    = NULL
    WHERE id = p_match_id;
    RETURN jsonb_build_object('status', 'agreed');
  END IF;

  -- Conflict: apply this player's claim and set temp fields so the organiser
  -- sees a pre-filled result they can correct before confirming.
  UPDATE public.tournament_matches
  SET winner_id      = v_winner_id,
      result         = v_result_str,
      temp_winner_id = v_winner_id,
      temp_result    = v_result_str,
      confirmed_by   = 'conflict'
  WHERE id = p_match_id;
  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO authenticated;
