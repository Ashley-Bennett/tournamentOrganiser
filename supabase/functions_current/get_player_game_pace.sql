CREATE OR REPLACE FUNCTION public.get_player_game_pace(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(timed_matches integer, median_minutes numeric, clock_pct numeric, went_to_time integer, fastest_minutes numeric, fastest_event text, fastest_opponent text, fastest_deck1 integer, fastest_deck2 integer, fastest_won boolean, slowest_minutes numeric, slowest_event text, slowest_opponent text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_entries AS (
    SELECT tp.id AS player_id, tp.tournament_id, tp.deck_pokemon1, tp.deck_pokemon2, t.name AS event_name
    FROM public.tournament_players tp
    JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.user_id = v_uid
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (p_from IS NULL OR COALESCE(t.starts_at, t.created_at) >= p_from)
      AND (p_to   IS NULL OR COALESCE(t.starts_at, t.created_at) <  p_to)
  ),
  timed AS (
    SELECT
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (tm.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes,
      me.event_name,
      me.deck_pokemon1,
      me.deck_pokemon2,
      opp.name AS opponent_name,
      tm.winner_id = me.player_id AS won
    FROM my_entries me
    JOIN public.tournament_matches tm
      ON tm.tournament_id = me.tournament_id
     AND (tm.player1_id = me.player_id OR tm.player2_id = me.player_id)
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND tm.result_recorded_at IS NOT NULL
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = tm.tournament_id AND tr.round_number = tm.round_number
    LEFT JOIN public.tournament_players opp
      ON opp.id = CASE WHEN tm.player1_id = me.player_id THEN tm.player2_id ELSE tm.player1_id END
    WHERE tm.result_recorded_at >= tr.started_at
  ),
  fastest AS (SELECT * FROM timed ORDER BY minutes ASC  LIMIT 1),
  slowest AS (SELECT * FROM timed ORDER BY minutes DESC LIMIT 1)
  SELECT
    (SELECT COUNT(*)::INT FROM timed),
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1) FROM timed t),
    (SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
                   / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0)
       FROM timed t WHERE t.duration_minutes IS NOT NULL),
    (SELECT COUNT(*)::INT FROM timed t
      WHERE t.duration_minutes IS NOT NULL AND t.minutes >= t.duration_minutes * 0.95),
    (SELECT ROUND(f.minutes::NUMERIC, 1) FROM fastest f),
    (SELECT f.event_name FROM fastest f),
    (SELECT f.opponent_name FROM fastest f),
    (SELECT f.deck_pokemon1 FROM fastest f),
    (SELECT f.deck_pokemon2 FROM fastest f),
    (SELECT f.won FROM fastest f),
    (SELECT ROUND(s.minutes::NUMERIC, 1) FROM slowest s),
    (SELECT s.event_name FROM slowest s),
    (SELECT s.opponent_name FROM slowest s);
END;
$function$
