CREATE OR REPLACE FUNCTION public.get_player_stats_games()
 RETURNS TABLE(game_id text, tournaments integer, matches integer)
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
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, t.game_id
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
  )
  SELECT
    me.game_id::TEXT,
    COUNT(DISTINCT me.tournament_id)::INT,
    COUNT(tm.id)::INT
  FROM my_entries me
  LEFT JOIN public.tournament_matches tm
    ON tm.tournament_id = me.tournament_id
    AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    AND tm.status IN ('completed', 'bye')
  GROUP BY me.game_id
  ORDER BY COUNT(DISTINCT me.tournament_id) DESC, me.game_id;
END;
$function$
