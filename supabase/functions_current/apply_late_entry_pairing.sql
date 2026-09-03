CREATE OR REPLACE FUNCTION public.apply_late_entry_pairing(p_player_id uuid, p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialise concurrent late entries so two callers cannot both claim the
  -- same waiting bye.
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players tp
    WHERE tp.id = p_player_id AND tp.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Player is not in this tournament';
  END IF;

  PERFORM public._apply_late_entry_pairing_unchecked(p_player_id, p_tournament_id);
END;
$function$
