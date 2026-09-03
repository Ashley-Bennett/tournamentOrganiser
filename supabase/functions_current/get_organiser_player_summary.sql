CREATE OR REPLACE FUNCTION public.get_organiser_player_summary(p_workspace_id uuid, p_identity_key text, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(display_name text, is_linked boolean, events_played integer, wins integer, losses integer, draws integer, byes integer, matches_played integer, best_finish integer, event_wins integer, first_seen timestamp with time zone, last_seen timestamp with time zone)
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
  WITH chosen AS (
    SELECT i.*
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE (
      p_tournament_ids IS NOT NULL AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  mine AS (
    SELECT c.*, t.status AS event_status
    FROM chosen c
    JOIN public.tournaments t ON t.id = c.tournament_id
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    MAX(m.display_name)::TEXT,
    BOOL_OR(m.is_linked),
    COUNT(DISTINCT m.tournament_id)::INT,
    COALESCE(SUM(ts.wins), 0)::INT,
    COALESCE(SUM(ts.losses), 0)::INT,
    COALESCE(SUM(ts.draws), 0)::INT,
    COALESCE(SUM(ts.byes_received), 0)::INT,
    COALESCE(SUM(ts.matches_played), 0)::INT,
    MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT,
    COUNT(*) FILTER (
      WHERE m.event_status = 'completed' AND ts.position = 1
    )::INT,
    MIN(m.played_at),
    MAX(m.played_at)
  FROM mine m
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = m.tournament_id
   AND ts.player_id     = m.tournament_player_id
  HAVING COUNT(*) > 0;
END;
$function$
