CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid, p_num_rounds integer, p_matches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_status       TEXT;
BEGIN
  SELECT t.workspace_id, t.status
  INTO v_workspace_id, v_status
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can start a tournament';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'This tournament has already started';
  END IF;

  IF p_num_rounds IS NULL OR p_num_rounds < 1 OR p_num_rounds > 20 THEN
    RAISE EXCEPTION 'A tournament needs between 1 and 20 rounds';
  END IF;

  UPDATE public.tournaments
  SET status       = 'active',
      num_rounds   = p_num_rounds,
      join_enabled = false
  WHERE id = p_tournament_id;

  PERFORM public.create_round(p_tournament_id, 1, p_matches);
END;
$function$
