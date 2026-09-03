CREATE OR REPLACE FUNCTION public.get_organiser_alert_state()
 RETURNS TABLE(tournament_id uuid, tournament_name text, workspace_slug text, round_number integer, total_matches integer, settled_matches integer, conflict_count integer, late_entries integer, latest_late_name text, latest_late_round integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT t.id, t.name, w.slug
    FROM public.tournaments t
    JOIN public.workspaces w
      ON w.id = t.workspace_id
    WHERE t.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.workspace_memberships wm
        WHERE wm.workspace_id = t.workspace_id
          AND wm.user_id = auth.uid()
      )
  ),
  latest AS (
    SELECT m.tournament_id, MAX(m.round_number) AS round_number
    FROM public.tournament_matches m
    WHERE m.tournament_id IN (SELECT id FROM mine)
    GROUP BY m.tournament_id
  ),
  late AS (
    SELECT
      p.tournament_id,
      COUNT(*)::INTEGER AS late_entries,
      (ARRAY_AGG(p.name ORDER BY p.created_at DESC))[1]::TEXT AS latest_name,
      (ARRAY_AGG(p.late_entry_round ORDER BY p.created_at DESC))[1] AS latest_round
    FROM public.tournament_players p
    WHERE p.tournament_id IN (SELECT id FROM mine)
      AND p.is_late_entry
      AND p.created_by IS NULL
    GROUP BY p.tournament_id
  )
  SELECT
    mine.id,
    mine.name::TEXT,
    mine.slug::TEXT,
    latest.round_number,
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (
      WHERE m.status IN ('completed', 'bye')
    )::INTEGER,
    COUNT(*) FILTER (
      WHERE r1.reported_outcome IS NOT NULL
        AND r2.reported_outcome IS NOT NULL
        AND NOT (
             (r1.reported_outcome = 'win'  AND r2.reported_outcome = 'loss')
          OR (r1.reported_outcome = 'loss' AND r2.reported_outcome = 'win')
          OR (r1.reported_outcome = 'draw' AND r2.reported_outcome = 'draw')
        )
    )::INTEGER,
    COALESCE(MAX(late.late_entries), 0)::INTEGER,
    MAX(late.latest_name)::TEXT,
    MAX(late.latest_round)::INTEGER
  FROM mine
  JOIN latest
    ON latest.tournament_id = mine.id
  JOIN public.tournament_matches m
    ON m.tournament_id = mine.id
   AND m.round_number = latest.round_number
  LEFT JOIN public.match_result_reports r1
    ON r1.match_id = m.id AND r1.player_id = m.player1_id
  LEFT JOIN public.match_result_reports r2
    ON r2.match_id = m.id AND r2.player_id = m.player2_id
  LEFT JOIN late
    ON late.tournament_id = mine.id
  GROUP BY mine.id, mine.name, mine.slug, latest.round_number;
$function$
