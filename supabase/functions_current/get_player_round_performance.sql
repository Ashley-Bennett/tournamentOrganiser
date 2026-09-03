CREATE OR REPLACE FUNCTION public.get_player_round_performance(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(round_number integer, wins integer, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  SELECT
    tm.round_number::INT,
    COUNT(*) FILTER (WHERE tm.winner_id = tp.id)::INT AS wins,
    COUNT(*) FILTER (WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL)::INT AS total
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  JOIN public.tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND (tm.player1_id = tp.id OR tm.player2_id = tp.id)
    AND tm.status = 'completed'
    AND tm.player2_id IS NOT NULL
  WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
    AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
    AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  GROUP BY tm.round_number
  ORDER BY tm.round_number;
END;
$function$
