-- get_match_result_reports referenced the non-existent table "workspace_members".
-- The actual table is "workspace_memberships". Fix the auth guard.

CREATE OR REPLACE FUNCTION public.get_match_result_reports(
  p_tournament_id UUID
)
RETURNS TABLE(
  match_id        UUID,
  match_number    INTEGER,
  round_number    INTEGER,
  player1_id      UUID,
  player1_name    TEXT,
  player2_id      UUID,
  player2_name    TEXT,
  player1_report  TEXT,
  player2_report  TEXT,
  conflict_status TEXT   -- 'agreed' | 'conflict' | 'partial'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_match_result_reports(UUID) TO authenticated;
