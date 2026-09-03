CREATE OR REPLACE FUNCTION public.get_organiser_reporting_health(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(total_results integer, player_reported integer, organiser_entered integer, unattributed integer, reports_submitted integer, awaiting_confirmation integer)
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
  WITH chosen_events AS (
    SELECT DISTINCT i.tournament_id AS tid
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
      AND (p_from IS NULL OR i.played_at >= p_from)
      AND (p_to   IS NULL OR i.played_at <  p_to)
  ),
  results AS (
    SELECT tm.id, tm.confirmed_by
    FROM public.tournament_matches tm
    JOIN chosen_events ce ON ce.tid = tm.tournament_id
    -- Byes are not reported by anyone, so they would only dilute the split.
    WHERE tm.status = 'completed' AND tm.player2_id IS NOT NULL
  )
  SELECT
    (SELECT COUNT(*)::INT FROM results),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by = 'player_report'),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by = 'organiser'),
    (SELECT COUNT(*)::INT FROM results r WHERE r.confirmed_by IS NULL),
    (SELECT COUNT(*)::INT
       FROM public.match_result_reports mrr
      WHERE mrr.match_id IN (SELECT r.id FROM results r)),
    -- A player has reported a result that nobody has confirmed yet. Not a
    -- health statistic so much as a to-do: these are matches sitting in a
    -- pending state waiting on the desk.
    (SELECT COUNT(*)::INT
       FROM public.tournament_matches tm
       JOIN chosen_events ce ON ce.tid = tm.tournament_id
      WHERE tm.status = 'pending'
        AND tm.confirmed_by = 'player_report');
END;
$function$
