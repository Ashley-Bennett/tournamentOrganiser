-- Extend get_tournament_for_join to return the list of already-registered
-- player names so the join page can validate names client-side before submit.
-- Must drop first because the return type changes (new registered_names column).

DROP FUNCTION IF EXISTS public.get_tournament_for_join(UUID);

CREATE OR REPLACE FUNCTION public.get_tournament_for_join(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_name  TEXT,
  status           TEXT,
  join_enabled     BOOLEAN,
  registered_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.name::TEXT,
    t.status::TEXT,
    t.join_enabled,
    COALESCE(
      ARRAY(
        SELECT tp.name
        FROM public.tournament_players tp
        WHERE tp.tournament_id = p_tournament_id
        ORDER BY tp.created_at
      ),
      '{}'::TEXT[]
    )
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;
