-- ── get_player_tournament_view ───────────────────────────────────────────────
-- Returns all tournament data a self-registered player needs: tournament info,
-- full match list (with names), the player's own match for the current round,
-- and any pending result report they've already submitted.
--
-- Authenticated via device_token (not Supabase auth). SECURITY DEFINER bypasses
-- RLS so player names can be read without the null-display_name issue.

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
  -- Validate device_token
  SELECT id, name, dropped, dropped_at_round
  INTO v_player
  FROM public.tournament_players
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id
    AND device_token = p_device_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Fetch tournament
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
      'id',              v_player.id,
      'name',            v_player.name,
      'dropped',         v_player.dropped,
      'dropped_at_round', v_player.dropped_at_round
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',              tp.id,
        'name',            tp.name,
        'dropped',         tp.dropped,
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

-- ── submit_match_result ───────────────────────────────────────────────────────
-- Player submits their outcome for a match ('win' | 'loss' | 'draw').
-- If both players have now submitted matching reports, the match is auto-confirmed
-- (status=completed) with confirmed_by='player_agreement' and reports are cleaned up.
-- If reports disagree, both rows are left for organiser review.
-- Returns: { status: 'submitted' | 'confirmed' | 'conflict' }

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
  -- Validate outcome value
  IF p_reported_outcome NOT IN ('win', 'loss', 'draw') THEN
    RAISE EXCEPTION 'Invalid outcome: must be win, loss, or draw';
  END IF;

  -- Validate device_token
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_player_id AND device_token = p_device_token
  ) THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Load match, validate player is in it
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
                submitted_at = now();

  -- Determine the other player
  v_other_player_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- Check if other player has reported
  SELECT reported_outcome INTO v_other_outcome
  FROM public.match_result_reports
  WHERE match_id = p_match_id AND player_id = v_other_player_id;

  IF NOT FOUND THEN
    -- Only one side submitted
    RETURN jsonb_build_object('status', 'submitted');
  END IF;

  -- Both reported — check for agreement.
  -- Agreement: my 'win' + their 'loss', my 'loss' + their 'win', or both 'draw'.
  IF NOT (
    (p_reported_outcome = 'win'  AND v_other_outcome = 'loss') OR
    (p_reported_outcome = 'loss' AND v_other_outcome = 'win')  OR
    (p_reported_outcome = 'draw' AND v_other_outcome = 'draw')
  ) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  -- Agreement — resolve winner and result string
  IF p_reported_outcome = 'draw' THEN
    v_winner_id  := NULL;
    v_result_str := 'Draw';
  ELSIF p_reported_outcome = 'win' THEN
    v_winner_id  := p_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '1-0' ELSE '0-1' END;
  ELSE
    -- p_reported_outcome = 'loss' → other player won
    v_winner_id  := v_other_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;
  END IF;

  -- Auto-confirm the match (trigger will clean up reports)
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

-- ── get_match_result_reports ──────────────────────────────────────────────────
-- Organiser view: returns all pending player-submitted reports for a tournament,
-- with agreement/conflict/partial status.
-- Authenticated only — validates caller is a workspace member.

CREATE OR REPLACE FUNCTION public.get_match_result_reports(
  p_tournament_id UUID
)
RETURNS TABLE(
  match_id        UUID,
  match_number    INTEGER,
  round_number    INTEGER,
  player1_id      UUID,
  player1_name    TEXT,
  player2_id      UUID,
  player2_name    TEXT,
  player1_report  TEXT,
  player2_report  TEXT,
  conflict_status TEXT   -- 'agreed' | 'conflict' | 'partial'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate caller is a workspace member for this tournament
  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments t
    JOIN public.workspace_members wm ON wm.workspace_id = t.workspace_id
    WHERE t.id = p_tournament_id
      AND wm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  RETURN QUERY
  SELECT
    m.id            AS match_id,
    m.match_number,
    m.round_number,
    m.player1_id,
    p1.name::TEXT   AS player1_name,
    m.player2_id,
    p2.name::TEXT   AS player2_name,
    r1.reported_outcome::TEXT AS player1_report,
    r2.reported_outcome::TEXT AS player2_report,
    CASE
      WHEN r1.reported_outcome IS NOT NULL AND r2.reported_outcome IS NOT NULL
      THEN
        CASE
          WHEN (r1.reported_outcome = 'win'  AND r2.reported_outcome = 'loss')
            OR (r1.reported_outcome = 'loss' AND r2.reported_outcome = 'win')
            OR (r1.reported_outcome = 'draw' AND r2.reported_outcome = 'draw')
          THEN 'agreed'
          ELSE 'conflict'
        END
      ELSE 'partial'
    END::TEXT       AS conflict_status
  FROM public.tournament_matches m
  JOIN public.tournament_players p1 ON p1.id = m.player1_id
  LEFT JOIN public.tournament_players p2 ON p2.id = m.player2_id
  LEFT JOIN public.match_result_reports r1
    ON r1.match_id = m.id AND r1.player_id = m.player1_id
  LEFT JOIN public.match_result_reports r2
    ON r2.match_id = m.id AND r2.player_id = m.player2_id
  WHERE m.tournament_id = p_tournament_id
    AND m.status IN ('ready', 'pending')
    AND (r1.id IS NOT NULL OR r2.id IS NOT NULL)
  ORDER BY m.round_number ASC, m.match_number ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_result_reports(UUID) TO authenticated;
