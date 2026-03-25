-- Fix: get_player_tournament_view returned NULL for matches/players arrays when empty.
-- jsonb_agg() returns NULL with no rows; COALESCE ensures we always return [].

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
