-- ── auto_confirm_first_report ────────────────────────────────────────────────
-- Changes result submission logic: the FIRST player to submit auto-confirms
-- the match immediately (confirmed_by='player_report'), reflected to the
-- organiser right away. If the OTHER player later submits a DIFFERENT outcome,
-- the match reverts to pending and both reports appear as a conflict for the
-- organiser to resolve. Same-outcome second submissions are silently accepted.

-- Allow confirmed_by = 'player_report' for first-player auto-confirms
ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_confirmed_by_check;
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_confirmed_by_check
    CHECK (confirmed_by IN ('organiser', 'player_agreement', 'player_report'));

-- ── submit_match_result (rewrite) ────────────────────────────────────────────
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
  v_match            RECORD;
  v_other_player_id  UUID;
  v_other_outcome    TEXT;
  v_winner_id        UUID;
  v_result_str       TEXT;
  v_expected_outcome TEXT;
  v_first_outcome    TEXT;
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

  SELECT id, tournament_id, player1_id, player2_id, status, winner_id, result, confirmed_by
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

  v_other_player_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- ── Already-completed match ───────────────────────────────────────────────
  IF v_match.status IN ('completed', 'bye') THEN
    -- Organiser-confirmed or bye: reject player submission
    IF v_match.status = 'bye' OR v_match.confirmed_by = 'organiser' THEN
      RAISE EXCEPTION 'Match is already completed';
    END IF;

    -- Completed by player_report or player_agreement: allow a contest check.
    -- Work out what outcome this player should have if the current result is right.
    IF v_match.result = 'Draw' THEN
      v_expected_outcome := 'draw';
    ELSIF v_match.winner_id = p_player_id THEN
      v_expected_outcome := 'win';
    ELSE
      v_expected_outcome := 'loss';
    END IF;

    IF p_reported_outcome = v_expected_outcome THEN
      -- Agrees — upgrade to player_agreement so the contest option goes away
      IF v_match.confirmed_by = 'player_report' THEN
        UPDATE public.tournament_matches
        SET confirmed_by = 'player_agreement'
        WHERE id = p_match_id;
      END IF;
      RETURN jsonb_build_object('status', 'confirmed');
    END IF;

    -- CONFLICT: player's outcome disagrees with the committed result.
    -- Reconstruct the other player's report from the current match state.
    IF v_match.result = 'Draw' THEN
      v_first_outcome := 'draw';
    ELSIF v_match.winner_id = v_other_player_id THEN
      v_first_outcome := 'win';
    ELSE
      v_first_outcome := 'loss';
    END IF;

    -- Revert to pending for organiser resolution
    UPDATE public.tournament_matches
    SET status       = 'pending',
        winner_id    = NULL,
        result       = NULL,
        confirmed_by = NULL
    WHERE id = p_match_id;

    -- Insert both sides (cleanup trigger only fires on → completed transitions)
    INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
    VALUES
      (p_match_id, v_other_player_id, v_first_outcome),
      (p_match_id, p_player_id,       p_reported_outcome)
    ON CONFLICT (match_id, player_id) DO UPDATE
      SET reported_outcome = EXCLUDED.reported_outcome,
          submitted_at     = now();

    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  -- ── Match is pending / ready ──────────────────────────────────────────────
  INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
  VALUES (p_match_id, p_player_id, p_reported_outcome)
  ON CONFLICT (match_id, player_id)
  DO UPDATE SET reported_outcome = EXCLUDED.reported_outcome,
                submitted_at     = now();

  -- Check whether the other player has already submitted
  SELECT reported_outcome INTO v_other_outcome
  FROM public.match_result_reports
  WHERE match_id = p_match_id AND player_id = v_other_player_id;

  IF NOT FOUND THEN
    -- ── First report — auto-confirm immediately ───────────────────────────
    IF p_reported_outcome = 'draw' THEN
      v_winner_id  := NULL;
      v_result_str := 'Draw';
    ELSIF p_reported_outcome = 'win' THEN
      v_winner_id  := p_player_id;
      v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '1-0' ELSE '0-1' END;
    ELSE
      v_winner_id  := v_other_player_id;
      v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;
    END IF;

    -- Cleanup trigger fires here and removes the just-inserted report
    UPDATE public.tournament_matches
    SET status         = 'completed',
        winner_id      = v_winner_id,
        result         = v_result_str,
        confirmed_by   = 'player_report',
        temp_winner_id = NULL,
        temp_result    = NULL
    WHERE id = p_match_id;

    RETURN jsonb_build_object('status', 'confirmed');
  END IF;

  -- ── Both submitted simultaneously ─────────────────────────────────────────
  IF NOT (
    (p_reported_outcome = 'win'  AND v_other_outcome = 'loss') OR
    (p_reported_outcome = 'loss' AND v_other_outcome = 'win')  OR
    (p_reported_outcome = 'draw' AND v_other_outcome = 'draw')
  ) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  -- Mutual agreement
  IF p_reported_outcome = 'draw' THEN
    v_winner_id  := NULL;
    v_result_str := 'Draw';
  ELSIF p_reported_outcome = 'win' THEN
    v_winner_id  := p_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '1-0' ELSE '0-1' END;
  ELSE
    v_winner_id  := v_other_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;
  END IF;

  UPDATE public.tournament_matches
  SET status         = 'completed',
      winner_id      = v_winner_id,
      result         = v_result_str,
      confirmed_by   = 'player_agreement',
      temp_winner_id = NULL,
      temp_result    = NULL
  WHERE id = p_match_id;

  RETURN jsonb_build_object('status', 'confirmed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── get_player_tournament_view (update) ──────────────────────────────────────
-- Adds confirmed_by to each match row so the player portal can show a
-- "Disagree?" contest section on player_report auto-confirmed matches.
CREATE OR REPLACE FUNCTION public.get_player_tournament_view(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player     RECORD;
  v_tournament RECORD;
  v_result     JSONB;
BEGIN
  SELECT id, name, dropped, dropped_at_round
  INTO v_player
  FROM public.tournament_players
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id
    AND device_token = p_device_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  SELECT id, name, status, num_rounds,
         round_duration_minutes, current_round_started_at,
         round_elapsed_seconds, round_is_paused, round_note
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT jsonb_build_object(
    'tournament', jsonb_build_object(
      'id',                       v_tournament.id,
      'name',                     v_tournament.name,
      'status',                   v_tournament.status,
      'num_rounds',               v_tournament.num_rounds,
      'round_duration_minutes',   v_tournament.round_duration_minutes,
      'current_round_started_at', v_tournament.current_round_started_at,
      'round_elapsed_seconds',    v_tournament.round_elapsed_seconds,
      'round_is_paused',          v_tournament.round_is_paused,
      'round_note',               v_tournament.round_note
    ),
    'player', jsonb_build_object(
      'id',               v_player.id,
      'name',             v_player.name,
      'dropped',          v_player.dropped,
      'dropped_at_round', v_player.dropped_at_round
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               tp.id,
        'name',             tp.name,
        'dropped',          tp.dropped,
        'dropped_at_round', tp.dropped_at_round
      ))
      FROM public.tournament_players tp
      WHERE tp.tournament_id = p_tournament_id
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',                 m.id,
        'round_number',       m.round_number,
        'match_number',       m.match_number,
        'player1_id',         m.player1_id,
        'player1_name',       p1.name,
        'player2_id',         m.player2_id,
        'player2_name',       p2.name,
        'winner_id',          m.winner_id,
        'result',             m.result,
        'status',             m.status,
        'confirmed_by',       m.confirmed_by,
        'pairings_published', m.pairings_published,
        'is_my_match',        (m.player1_id = p_player_id OR m.player2_id = p_player_id)
      ) ORDER BY m.round_number ASC, m.match_number ASC NULLS LAST)
      FROM public.tournament_matches m
      JOIN public.tournament_players p1 ON p1.id = m.player1_id
      LEFT JOIN public.tournament_players p2 ON p2.id = m.player2_id
      WHERE m.tournament_id = p_tournament_id
        AND (m.pairings_published = true OR m.status IN ('pending', 'completed', 'bye'))
    ), '[]'::jsonb),
    'my_report', (
      SELECT jsonb_build_object('reported_outcome', r.reported_outcome)
      FROM public.match_result_reports r
      JOIN public.tournament_matches m ON m.id = r.match_id
      WHERE r.player_id = p_player_id
        AND m.tournament_id = p_tournament_id
        AND m.status IN ('ready', 'pending')
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO authenticated;
