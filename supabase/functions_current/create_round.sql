CREATE OR REPLACE FUNCTION public.create_round(p_tournament_id uuid, p_round_number integer, p_matches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_status       TEXT;
  v_num_rounds   INTEGER;
BEGIN
  SELECT t.workspace_id, t.status, t.num_rounds
  INTO v_workspace_id, v_status, v_num_rounds
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can pair rounds';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Rounds can only be paired while the tournament is running';
  END IF;

  IF p_round_number < 1 OR (v_num_rounds IS NOT NULL AND p_round_number > v_num_rounds) THEN
    RAISE EXCEPTION 'Round % is outside this tournament', p_round_number;
  END IF;

  IF p_round_number > 1 AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = p_round_number - 1
  ) THEN
    RAISE EXCEPTION 'Round % has not been paired yet', p_round_number - 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = p_round_number
  ) THEN
    RAISE EXCEPTION 'Round % has already been paired', p_round_number;
  END IF;

  PERFORM public._insert_round_matches(
    p_tournament_id, v_workspace_id, p_round_number, p_matches
  );

  UPDATE public.tournaments
  SET current_round_started_at = NULL,
      round_elapsed_seconds    = 0,
      round_is_paused          = false
  WHERE id = p_tournament_id;
END;
$function$
