CREATE OR REPLACE FUNCTION public.get_organiser_stats_years(p_workspace_id uuid, p_game_id text DEFAULT NULL::text)
 RETURNS TABLE(year integer, tournaments integer, players integer)
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
  SELECT
    EXTRACT(YEAR FROM i.played_at)::INT AS yr,
    COUNT(DISTINCT i.tournament_id)::INT,
    COUNT(DISTINCT i.identity_key)::INT
  FROM public.workspace_player_identities(p_workspace_id) i
  WHERE (p_game_id IS NULL OR i.game_id = p_game_id)
  GROUP BY EXTRACT(YEAR FROM i.played_at)
  ORDER BY yr DESC;
END;
$function$
