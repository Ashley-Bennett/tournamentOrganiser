CREATE OR REPLACE FUNCTION public.get_organiser_attendance(p_workspace_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(identity_key text, display_name text, is_linked boolean, events_played integer, first_played timestamp with time zone, last_played timestamp with time zone, matches integer, match_wins integer, event_wins integer, top3_finishes integer)
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
  match_stats AS (
    SELECT
      ir.identity_key AS ikey,
      COUNT(tm.id)::INT AS n_matches,
      COUNT(tm.id) FILTER (
        WHERE tm.status = 'bye'
           OR (tm.status = 'completed' AND tm.winner_id = ir.tournament_player_id)
      )::INT AS n_wins
    FROM in_range ir
    JOIN public.tournament_matches tm
      ON tm.tournament_id = ir.tournament_id
     AND (tm.player1_id = ir.tournament_player_id OR tm.player2_id = ir.tournament_player_id)
     AND tm.status IN ('completed', 'bye')
    GROUP BY ir.identity_key
  ),
  finishes AS (
    SELECT
      ir.identity_key AS ikey,
      COUNT(*) FILTER (WHERE ts.position = 1)::INT AS n_event_wins,
      COUNT(*) FILTER (WHERE ts.position <= 3 AND fs.n >= 3)::INT AS n_top3
    FROM in_range ir
    JOIN public.tournaments t
      ON t.id = ir.tournament_id AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = ir.tournament_id
     AND ts.player_id = ir.tournament_player_id
    JOIN (
      SELECT ts2.tournament_id AS tid, COUNT(*)::INT AS n
      FROM public.tournament_standings ts2
      GROUP BY ts2.tournament_id
    ) fs ON fs.tid = ir.tournament_id
    GROUP BY ir.identity_key
  ),
  summary AS (
    SELECT
      ir.identity_key                         AS ikey,
      MAX(ir.display_name)                    AS name,
      BOOL_OR(ir.is_linked)                   AS linked,
      COUNT(DISTINCT ir.tournament_id)::INT   AS n_events,
      MIN(ir.played_at)                       AS first_at,
      MAX(ir.played_at)                       AS last_at
    FROM in_range ir
    GROUP BY ir.identity_key
  )
  SELECT
    s.ikey,
    s.name,
    s.linked,
    s.n_events,
    s.first_at,
    s.last_at,
    COALESCE(ms.n_matches, 0),
    COALESCE(ms.n_wins, 0),
    COALESCE(f.n_event_wins, 0),
    COALESCE(f.n_top3, 0)
  FROM summary s
  LEFT JOIN match_stats ms ON ms.ikey = s.ikey
  LEFT JOIN finishes    f  ON f.ikey  = s.ikey
  ORDER BY s.n_events DESC, s.last_at DESC, s.name
  LIMIT GREATEST(p_limit, 1);
END;
$function$
