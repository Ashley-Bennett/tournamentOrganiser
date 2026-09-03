CREATE OR REPLACE FUNCTION public.get_tournament_for_join(p_tournament_id uuid)
 RETURNS TABLE(tournament_name text, status text, join_enabled boolean, registered_names text[], starts_at timestamp with time zone, game_format text, location text, description text, allow_late_join boolean, current_round integer, round_in_progress boolean, game_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    t.name::TEXT,
    t.status::TEXT,
    t.join_enabled,
    CASE
      WHEN t.join_enabled AND t.status = 'draft' THEN
        COALESCE(
          ARRAY(
            SELECT tp.name
            FROM public.tournament_players tp
            WHERE tp.tournament_id = p_tournament_id
            ORDER BY tp.created_at
          ),
          '{}'::TEXT[]
        )
      ELSE '{}'::TEXT[]
    END,
    t.starts_at,
    t.game_format::TEXT,
    t.location::TEXT,
    t.description::TEXT,
    -- Only advertise late join while the cutoff (if any) still allows it.
    (
      t.allow_late_join
      AND t.status = 'active'
      AND (
        t.late_join_until_round IS NULL
        OR COALESCE((
          SELECT MAX(m.round_number) FROM public.tournament_matches m
          WHERE m.tournament_id = p_tournament_id
        ), 1) <= t.late_join_until_round
      )
    ),
    COALESCE((
      SELECT MAX(m.round_number) FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
    ), 1),
    COALESCE((
      SELECT BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL))
      FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.round_number = (
          SELECT MAX(m2.round_number) FROM public.tournament_matches m2
          WHERE m2.tournament_id = p_tournament_id
        )
    ), FALSE),
    t.game_id::TEXT
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$function$
