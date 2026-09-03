CREATE OR REPLACE FUNCTION public.get_organiser_league_table(p_workspace_id uuid, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_placement_points integer[] DEFAULT ARRAY[10, 8, 6, 5, 4, 3, 2, 1])
 RETURNS TABLE(identity_key text, display_name text, is_linked boolean, events_played integer, match_points integer, placement_points integer, total_points integer, wins integer, losses integer, draws integer, byes integer, matches_played integer, best_finish integer, event_wins integer)
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
      -- Explicit selection, intersected with the workspace by construction:
      -- workspace_player_identities only ever returns this workspace's rows.
      p_tournament_ids IS NOT NULL
        AND i.tournament_id = ANY(p_tournament_ids)
    )
    OR (
      p_tournament_ids IS NULL
        AND (p_game_id IS NULL OR i.game_id = p_game_id)
        AND (p_from IS NULL OR i.played_at >= p_from)
        AND (p_to   IS NULL OR i.played_at <  p_to)
    )
  ),
  scored AS (
    SELECT
      c.identity_key AS ikey,
      c.display_name AS name,
      c.is_linked    AS linked,
      c.tournament_id,
      t.status                         AS event_status,
      COALESCE(ts.match_points, 0)     AS mp,
      COALESCE(ts.wins, 0)             AS w,
      COALESCE(ts.losses, 0)           AS l,
      COALESCE(ts.draws, 0)            AS d,
      COALESCE(ts.byes_received, 0)    AS b,
      COALESCE(ts.matches_played, 0)   AS mplayed,
      ts.position,
      -- Placement points: completed events only, and only for a position the
      -- scheme actually covers. A 12th place in an 8-deep scheme scores zero
      -- rather than erroring on the array index.
      CASE
        WHEN t.status = 'completed'
         AND ts.position IS NOT NULL
         AND ts.position >= 1
         AND ts.position <= COALESCE(ARRAY_LENGTH(p_placement_points, 1), 0)
        THEN p_placement_points[ts.position]
        ELSE 0
      END AS pp
    FROM chosen c
    JOIN public.tournaments t ON t.id = c.tournament_id
    LEFT JOIN public.tournament_standings ts
      ON ts.tournament_id = c.tournament_id
     AND ts.player_id     = c.tournament_player_id
  )
  SELECT
    s.ikey,
    MAX(s.name),
    BOOL_OR(s.linked),
    COUNT(DISTINCT s.tournament_id)::INT,
    SUM(s.mp)::INT,
    SUM(s.pp)::INT,
    (SUM(s.mp) + SUM(s.pp))::INT,
    SUM(s.w)::INT,
    SUM(s.l)::INT,
    SUM(s.d)::INT,
    SUM(s.b)::INT,
    SUM(s.mplayed)::INT,
    MIN(s.position) FILTER (WHERE s.event_status = 'completed')::INT,
    COUNT(*) FILTER (WHERE s.event_status = 'completed' AND s.position = 1)::INT
  FROM scored s
  GROUP BY s.ikey
  ORDER BY
    (SUM(s.mp) + SUM(s.pp)) DESC,
    SUM(s.mp) DESC,
    MIN(s.position) FILTER (WHERE s.event_status = 'completed') ASC NULLS LAST,
    MAX(s.name);
END;
$function$
