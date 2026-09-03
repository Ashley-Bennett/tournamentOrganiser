CREATE OR REPLACE FUNCTION public.get_organiser_player_pace(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_min_matches integer DEFAULT 3)
 RETURNS TABLE(identity_key text, display_name text, is_linked boolean, timed_matches integer, median_minutes numeric, fastest_minutes numeric, slowest_minutes numeric, clock_pct numeric, went_to_time integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH in_range AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  timed AS (
    SELECT
      ir.identity_key AS ikey,
      ir.display_name AS name,
      ir.is_linked    AS linked,
      GREATEST(
        0,
        EXTRACT(EPOCH FROM (tm.result_recorded_at - tr.started_at)) - tr.paused_seconds
      ) / 60.0 AS minutes,
      tr.duration_minutes
    FROM in_range ir
    JOIN public.tournament_matches tm
      ON tm.tournament_id = ir.tournament_id
     AND (tm.player1_id = ir.tournament_player_id OR tm.player2_id = ir.tournament_player_id)
     AND tm.status = 'completed'
     AND tm.player2_id IS NOT NULL
     AND tm.result_recorded_at IS NOT NULL
    JOIN public.tournament_rounds tr
      ON tr.tournament_id = tm.tournament_id AND tr.round_number = tm.round_number
    WHERE tm.result_recorded_at >= tr.started_at
  )
  SELECT
    t.ikey,
    MAX(t.name),
    BOOL_OR(t.linked),
    COUNT(*)::INT,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)::NUMERIC, 1),
    ROUND(MIN(t.minutes)::NUMERIC, 1),
    ROUND(MAX(t.minutes)::NUMERIC, 1),
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes)
           / NULLIF(AVG(t.duration_minutes), 0) * 100)::NUMERIC, 0),
    -- Games that ran to 95% of the clock or beyond: "always goes to time".
    COUNT(*) FILTER (
      WHERE t.duration_minutes IS NOT NULL
        AND t.minutes >= t.duration_minutes * 0.95
    )::INT
  FROM timed t
  GROUP BY t.ikey
  HAVING COUNT(*) >= GREATEST(p_min_matches, 1)
  ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.minutes) DESC NULLS LAST;
END;
$function$
