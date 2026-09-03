CREATE OR REPLACE FUNCTION public.get_organiser_deck_pilots(p_workspace_id uuid, p_deck_pokemon1 integer DEFAULT NULL::integer, p_deck_pokemon2 integer DEFAULT NULL::integer, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(identity_key text, display_name text, is_linked boolean, entries integer, match_wins integer, total_matches integer, best_finish integer, event_wins integer, first_used timestamp with time zone, last_used timestamp with time zone)
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
  decked AS (
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.identity_key         AS ikey,
      c.display_name         AS name,
      c.is_linked            AS linked,
      c.played_at
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE tp.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
      AND tp.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
  ),
  match_stats AS (
    SELECT
      d.ikey,
      COUNT(tm.id)::INT AS n_matches,
      COUNT(tm.id) FILTER (
        WHERE tm.status = 'bye'
           OR (tm.status = 'completed' AND tm.winner_id = d.tpid)
      )::INT AS n_wins
    FROM decked d
    JOIN public.tournament_matches tm
      ON tm.tournament_id = d.tid
     AND (tm.player1_id = d.tpid OR tm.player2_id = d.tpid)
     AND tm.status IN ('completed', 'bye')
    GROUP BY d.ikey
  ),
  finishes AS (
    SELECT
      d.ikey,
      MIN(ts.position)::INT                        AS best_pos,
      COUNT(*) FILTER (WHERE ts.position = 1)::INT AS n_event_wins
    FROM decked d
    JOIN public.tournaments t ON t.id = d.tid AND t.status = 'completed'
    JOIN public.tournament_standings ts
      ON ts.tournament_id = d.tid AND ts.player_id = d.tpid
    GROUP BY d.ikey
  ),
  summary AS (
    SELECT
      d.ikey,
      MAX(d.name)      AS name,
      BOOL_OR(d.linked) AS linked,
      COUNT(*)::INT    AS n_entries,
      MIN(d.played_at) AS first_at,
      MAX(d.played_at) AS last_at
    FROM decked d
    GROUP BY d.ikey
  )
  SELECT
    s.ikey,
    s.name,
    s.linked,
    s.n_entries,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0),
    f.best_pos,
    COALESCE(f.n_event_wins, 0),
    s.first_at,
    s.last_at
  FROM summary s
  LEFT JOIN match_stats ms ON ms.ikey = s.ikey
  LEFT JOIN finishes    f  ON f.ikey  = s.ikey
  ORDER BY s.n_entries DESC, COALESCE(ms.n_wins, 0) DESC, s.name;
END;
$function$
