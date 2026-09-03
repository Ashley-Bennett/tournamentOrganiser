CREATE OR REPLACE FUNCTION public.get_organiser_deck_events(p_workspace_id uuid, p_deck_pokemon1 integer DEFAULT NULL::integer, p_deck_pokemon2 integer DEFAULT NULL::integer, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(tournament_id uuid, tournament_name text, played_at timestamp with time zone, event_status text, copies integer, field_size integer, best_finish integer, match_wins integer, total_matches integer)
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
      c.played_at
    FROM chosen c
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE tp.deck_pokemon1 IS NOT DISTINCT FROM p_deck_pokemon1
      AND tp.deck_pokemon2 IS NOT DISTINCT FROM p_deck_pokemon2
  ),
  per_event AS (
    SELECT
      d.tid,
      MIN(d.played_at)  AS played_at,
      COUNT(*)::INT     AS copies
    FROM decked d
    GROUP BY d.tid
  ),
  match_stats AS (
    SELECT
      d.tid,
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
    GROUP BY d.tid
  ),
  best AS (
    SELECT d.tid, MIN(ts.position)::INT AS best_pos
    FROM decked d
    JOIN public.tournament_standings ts
      ON ts.tournament_id = d.tid AND ts.player_id = d.tpid
    GROUP BY d.tid
  ),
  field AS (
    SELECT ts.tournament_id AS tid, COUNT(*)::INT AS n
    FROM public.tournament_standings ts
    GROUP BY ts.tournament_id
  )
  SELECT
    pe.tid,
    t.name,
    pe.played_at,
    t.status,
    pe.copies,
    COALESCE(fl.n, 0),
    b.best_pos,
    COALESCE(ms.n_wins, 0),
    COALESCE(ms.n_matches, 0)
  FROM per_event pe
  JOIN public.tournaments t ON t.id = pe.tid
  LEFT JOIN match_stats ms ON ms.tid = pe.tid
  LEFT JOIN best        b  ON b.tid  = pe.tid
  LEFT JOIN field       fl ON fl.tid = pe.tid
  ORDER BY pe.played_at DESC;
END;
$function$
