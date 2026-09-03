CREATE OR REPLACE FUNCTION public.remove_player_from_round(p_player_id uuid, p_round integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_id UUID;
  v_workspace_id  UUID;
BEGIN
  SELECT tp.tournament_id, tp.workspace_id
  INTO v_tournament_id, v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can change pairings';
  END IF;

  -- Same lock late joins take, so a player scanning the QR right now cannot
  -- absorb the bye we are in the middle of creating.
  PERFORM 1 FROM public.tournaments WHERE id = v_tournament_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND m.round_number  = p_round
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'That match already has a result. Clear the result first.';
  END IF;

  PERFORM public._remove_player_from_round_unchecked(
    p_player_id, v_tournament_id, p_round
  );
END;
$function$
