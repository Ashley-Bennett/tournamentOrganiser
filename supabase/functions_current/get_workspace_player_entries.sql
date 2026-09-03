CREATE OR REPLACE FUNCTION public.get_workspace_player_entries(p_workspace_id uuid, p_identity_key text)
 RETURNS TABLE(tournament_player_id uuid, entry_name text, tournament_name text, played_at timestamp with time zone, is_overridden boolean)
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
    i.tournament_player_id,
    tp.name,
    t.name,
    i.played_at,
    l.tournament_player_id IS NOT NULL
  FROM public.workspace_player_identities(p_workspace_id) i
  JOIN public.tournament_players tp ON tp.id = i.tournament_player_id
  JOIN public.tournaments t ON t.id = i.tournament_id
  LEFT JOIN public.workspace_player_links l ON l.tournament_player_id = i.tournament_player_id
  WHERE i.identity_key = p_identity_key
  ORDER BY i.played_at DESC;
END;
$function$
