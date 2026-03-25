-- ── organiser_confirms_results ───────────────────────────────────────────────
-- Removes auto-confirm behaviour: player-submitted reports always stay pending
-- in match_result_reports until the organiser explicitly confirms the result.
-- The organiser always has final say.
--
-- Changes:
--   • submit_match_result no longer sets status='completed'; it only stores the
--     report and returns 'submitted' | 'agreed' | 'conflict'.
--   • get_player_tournament_view gains a per-match `report_count` field so the
--     player-side pairings table can show a "Reported" indicator.

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
  v_match           RECORD;
  v_other_player_id UUID;
  v_other_outcome   TEXT;
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

  -- Organiser has final say: reject submissions on completed/bye matches
  IF v_match.status IN ('completed', 'bye') THEN
    RAISE EXCEPTION 'Match is already completed';
  END IF;

  -- Upsert this player's report (allows changing before organiser confirms)
  INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
  VALUES (p_match_id, p_player_id, p_reported_outcome)
  ON CONFLICT (match_id, player_id)
  DO UPDATE SET reported_outcome = EXCLUDED.reported_outcome,
                submitted_at     = now();

  v_other_player_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- Check if the other player has also submitted
  SELECT reported_outcome INTO v_other_outcome
  FROM public.match_result_reports
  WHERE match_id = p_match_id AND player_id = v_other_player_id;

  IF NOT FOUND THEN
    -- Only one side submitted — leave pending for organiser
    RETURN jsonb_build_object('status', 'submitted');
  END IF;

  -- Both submitted — check agreement and inform the UI, but do NOT auto-complete
  IF (p_reported_outcome = 'win'  AND v_other_outcome = 'loss')
  OR (p_reported_outcome = 'loss' AND v_other_outcome = 'win')
  OR (p_reported_outcome = 'draw' AND v_other_outcome = 'draw')
  THEN
    RETURN jsonb_build_object('status', 'agreed');
  END IF;

  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── get_player_tournament_view (update) ──────────────────────────────────────
-- Adds `report_count` (0 | 1 | 2) to each match row so the player-side
-- pairings table can surface a "Reported" badge while the match is still pending.
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
        'is_my_match',        (m.player1_id = p_player_id OR m.player2_id = p_player_id),
        'report_count',       (
          SELECT COUNT(*)::int
          FROM public.match_result_reports r
          WHERE r.match_id = m.id
        )
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
