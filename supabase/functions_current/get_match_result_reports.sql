CREATE OR REPLACE FUNCTION public.get_match_result_reports(p_tournament_id uuid)
 RETURNS TABLE(match_id uuid, match_number integer, round_number integer, player1_id uuid, player1_name text, player2_id uuid, player2_name text, player1_report text, player2_report text, conflict_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate caller is a workspace member for this tournament
  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments t
    JOIN public.workspace_memberships wm ON wm.workspace_id = t.workspace_id
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
$function$
