CREATE OR REPLACE FUNCTION public.get_player_stats_years(p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(year integer, tournaments integer, matches integer)
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
    SELECT
      tp.id AS player_id,
      tp.tournament_id,
      EXTRACT(YEAR FROM COALESCE(t.starts_at, t.created_at))::INT AS yr
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
  )
  SELECT
    me.yr,
    COUNT(DISTINCT me.tournament_id)::INT,
    COUNT(tm.id)::INT
  FROM my_entries me
  LEFT JOIN public.tournament_matches tm
    ON tm.tournament_id = me.tournament_id
    AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
    AND tm.status IN ('completed', 'bye')
  GROUP BY me.yr
  ORDER BY me.yr DESC;
END;
$function$
