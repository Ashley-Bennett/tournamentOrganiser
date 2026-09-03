CREATE OR REPLACE FUNCTION public.get_organiser_stats_games(p_workspace_id uuid)
 RETURNS TABLE(game_id text, tournaments integer, players integer)
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
    i.game_id::TEXT,
    COUNT(DISTINCT i.tournament_id)::INT,
    COUNT(DISTINCT i.identity_key)::INT
  FROM public.workspace_player_identities(p_workspace_id) i
  GROUP BY i.game_id
  ORDER BY COUNT(DISTINCT i.tournament_id) DESC, i.game_id;
END;
$function$
