CREATE OR REPLACE FUNCTION public.get_organiser_player_events(p_workspace_id uuid, p_identity_key text, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(tournament_id uuid, tournament_name text, played_at timestamp with time zone, event_status text, deck_pokemon1 integer, deck_pokemon2 integer, wins integer, losses integer, draws integer, byes integer, matches_played integer, finish_position integer, field_size integer)
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
  )
  SELECT
    c.tournament_id,
    t.name::TEXT,
    c.played_at,
    t.status::TEXT,
    tp.deck_pokemon1,
    tp.deck_pokemon2,
    COALESCE(ts.wins, 0)::INT,
    COALESCE(ts.losses, 0)::INT,
    COALESCE(ts.draws, 0)::INT,
    COALESCE(ts.byes_received, 0)::INT,
    COALESCE(ts.matches_played, 0)::INT,
    ts.position::INT,
    (
      SELECT COUNT(*)::INT
      FROM public.tournament_players f
      WHERE f.tournament_id = c.tournament_id
    )
  FROM chosen c
  JOIN public.tournaments t         ON t.id  = c.tournament_id
  JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
  LEFT JOIN public.tournament_standings ts
    ON ts.tournament_id = c.tournament_id
   AND ts.player_id     = c.tournament_player_id
  WHERE c.identity_key = p_identity_key
  ORDER BY c.played_at DESC;
END;
$function$
