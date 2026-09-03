CREATE OR REPLACE FUNCTION public.get_my_card_games()
 RETURNS TABLE(game_id text, entries integer, last_played timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    t.game_id::TEXT,
    COUNT(*)::INT,
    MAX(COALESCE(t.starts_at, t.created_at))
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.user_id = auth.uid()
    AND t.game_id IS NOT NULL
  GROUP BY t.game_id
  ORDER BY MAX(COALESCE(t.starts_at, t.created_at)) DESC;
END;
$function$
