CREATE OR REPLACE FUNCTION public.list_workspace_players(p_workspace_id uuid)
 RETURNS TABLE(user_id uuid, preferred_name text, display_name text, created_at timestamp with time zone, tournaments_played integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  RETURN QUERY
  SELECT
    wp.user_id,
    wp.preferred_name,
    p.display_name,
    wp.created_at,
    (
      SELECT COUNT(*)::INTEGER
      FROM public.tournament_players tp
      WHERE tp.workspace_id = p_workspace_id
        AND tp.user_id = wp.user_id
    ) AS tournaments_played
  FROM public.workspace_players wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  WHERE wp.workspace_id = p_workspace_id
  ORDER BY tournaments_played DESC, wp.created_at DESC;
END;
$function$
