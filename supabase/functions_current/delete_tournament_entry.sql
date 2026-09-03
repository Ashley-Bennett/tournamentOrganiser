CREATE OR REPLACE FUNCTION public.delete_tournament_entry(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_id UUID;
  v_workspace_id  UUID;
  v_round         INTEGER;
BEGIN
  SELECT tp.tournament_id, tp.workspace_id
  INTO v_tournament_id, v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can remove players';
  END IF;

  PERFORM 1 FROM public.tournaments WHERE id = v_tournament_id FOR UPDATE;

  -- A completed match against a real opponent is a played game. Byes and the
  -- auto-losses a late entry picks up for missed rounds are not.
  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player has already played a match, so drop them instead of deleting.';
  END IF;

  FOR v_round IN
    SELECT DISTINCT m.round_number
    FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
    ORDER BY m.round_number DESC
  LOOP
    PERFORM public._remove_player_from_round_unchecked(
      p_player_id, v_tournament_id, v_round
    );
  END LOOP;

  DELETE FROM public.tournament_players WHERE id = p_player_id;
END;
$function$
