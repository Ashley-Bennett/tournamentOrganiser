-- Add deck pokemon columns to tournament_players and RPCs for setting/reading them.

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE public.tournament_players
  ADD COLUMN IF NOT EXISTS deck_pokemon1 INTEGER,
  ADD COLUMN IF NOT EXISTS deck_pokemon2 INTEGER;

-- ── 2. set_player_deck ────────────────────────────────────────────────────────
-- Device-token authenticated. Player sets up to 2 pokemon IDs (1-1025) to
-- represent their deck. Either or both can be NULL to clear the selection.

CREATE OR REPLACE FUNCTION public.set_player_deck(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT,
  p_pokemon1      INTEGER,
  p_pokemon2      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate credentials
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = p_player_id
      AND tournament_id = p_tournament_id
      AND device_token = p_device_token
  ) THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Validate pokemon IDs are in range if provided
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 1025) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 1025) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  UPDATE public.tournament_players
  SET deck_pokemon1 = p_pokemon1,
      deck_pokemon2 = p_pokemon2
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 3. get_player_tournament_view (updated) ───────────────────────────────────
-- Adds deck_pokemon1 and deck_pokemon2 to both `player` and each entry in `players`.

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
  SELECT id, name, dropped, dropped_at_round, deck_pokemon1, deck_pokemon2
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
      'dropped_at_round', v_player.dropped_at_round,
      'deck_pokemon1',    v_player.deck_pokemon1,
      'deck_pokemon2',    v_player.deck_pokemon2
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               tp.id,
        'name',             tp.name,
        'dropped',          tp.dropped,
        'dropped_at_round', tp.dropped_at_round,
        'deck_pokemon1',    tp.deck_pokemon1,
        'deck_pokemon2',    tp.deck_pokemon2
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
