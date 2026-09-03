CREATE OR REPLACE FUNCTION public.get_organiser_player_decks(p_workspace_id uuid, p_identity_key text, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(deck_pokemon1 integer, deck_pokemon2 integer, entries integer, wins integer, losses integer, draws integer, matches_played integer, best_finish integer, event_wins integer, first_used timestamp with time zone, last_used timestamp with time zone)
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
    SELECT
      c.tournament_player_id AS tpid,
      c.tournament_id        AS tid,
      c.played_at,
      t.status               AS event_status,
      tp.deck_pokemon1       AS d1,
      tp.deck_pokemon2       AS d2
    FROM chosen c
    JOIN public.tournaments t        ON t.id  = c.tournament_id
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE c.identity_key = p_identity_key
  )
  SELECT
    m.d1,
    m.d2,
    COUNT(*)::INT,
    COALESCE(SUM(ts.wins), 0)::INT,
    COALESCE(SUM(ts.losses), 0)::INT,
    COALESCE(SUM(ts.draws), 0)::INT,
    COALESCE(SUM(ts.matches_played), 0)::INT,
    MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT,
    COUNT(*) FILTER (
      WHERE m.event_status = 'completed' AND ts.position = 1
    )::INT,
    MIN(m.played_at),
    MAX(m.played_at)
  FROM mine m
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = m.tid
   AND ts.player_id     = m.tpid
  GROUP BY m.d1, m.d2
  ORDER BY COUNT(*) DESC, MAX(m.played_at) DESC;
END;
$function$
