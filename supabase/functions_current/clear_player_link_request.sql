CREATE OR REPLACE FUNCTION public.clear_player_link_request(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT tp.workspace_id INTO v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can clear link requests';
  END IF;

  UPDATE public.tournament_players
  SET link_requested_at = NULL
  WHERE id = p_player_id;
END;
$function$
