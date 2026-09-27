CREATE OR REPLACE FUNCTION public.get_organiser_player_decks(p_workspace_id uuid, p_identity_key text, p_tournament_ids uuid[] DEFAULT NULL::uuid[], p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_game_id text DEFAULT NULL::text, p_stack_variants boolean DEFAULT false)
 RETURNS TABLE(deck_pokemon1 integer, deck_pokemon2 integer, variants integer, entries integer, wins integer, losses integer, draws integer, matches_played integer, best_finish integer, event_wins integer, first_used timestamp with time zone, last_used timestamp with time zone)
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
      tp.deck_pokemon1       AS r1,
      tp.deck_pokemon2       AS r2,
      -- NULL for entries without a deck; they still group together as before.
      public.deck_stats_key(tp.deck_pokemon1, tp.deck_pokemon2, p_stack_variants) AS k
    FROM chosen c
    JOIN public.tournaments t        ON t.id  = c.tournament_id
    JOIN public.tournament_players tp ON tp.id = c.tournament_player_id
    WHERE c.identity_key = p_identity_key
  ),
  grouped AS (
    SELECT
      CASE WHEN COUNT(DISTINCT public.deck_norm(m.r1, m.r2)) = 1
           THEN mode() WITHIN GROUP (ORDER BY public.deck_entered(m.r1, m.r2))
           ELSE m.k END AS shown,
      COUNT(DISTINCT public.deck_norm(m.r1, m.r2))::INT AS n_variants,
      COUNT(*)::INT AS n_entries,
      COALESCE(SUM(ts.wins), 0)::INT AS n_wins,
      COALESCE(SUM(ts.losses), 0)::INT AS n_losses,
      COALESCE(SUM(ts.draws), 0)::INT AS n_draws,
      COALESCE(SUM(ts.matches_played), 0)::INT AS n_played,
      MIN(ts.position) FILTER (WHERE m.event_status = 'completed')::INT AS best_pos,
      COUNT(*) FILTER (
        WHERE m.event_status = 'completed' AND ts.position = 1
      )::INT AS n_event_wins,
      MIN(m.played_at) AS first_at,
      MAX(m.played_at) AS last_at
    FROM mine m
    LEFT JOIN public.tournament_standings ts
      ON ts.tournament_id = m.tid
     AND ts.player_id     = m.tpid
    GROUP BY m.k
  )
  SELECT
    g.shown[1], g.shown[2], g.n_variants, g.n_entries,
    g.n_wins, g.n_losses, g.n_draws, g.n_played,
    g.best_pos, g.n_event_wins, g.first_at, g.last_at
  FROM grouped g
  ORDER BY g.n_entries DESC, g.last_at DESC;
END;
$function$
