CREATE OR REPLACE FUNCTION public.replace_round_matches(p_tournament_id uuid, p_round_number integer, p_match_ids uuid[], p_matches jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_found        INTEGER;
BEGIN
  SELECT t.workspace_id
  INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can change pairings';
  END IF;

  IF p_match_ids IS NULL OR cardinality(p_match_ids) = 0 THEN
    RAISE EXCEPTION 'No pairings to replace';
  END IF;

  SELECT count(*) INTO v_found
  FROM public.tournament_matches m
  WHERE m.id = ANY (p_match_ids)
    AND m.tournament_id = p_tournament_id
    AND m.round_number  = p_round_number;

  IF v_found <> cardinality(p_match_ids) THEN
    RAISE EXCEPTION 'These pairings have changed since you opened them. Refresh and try again.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.id = ANY (p_match_ids)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A match you edited already has a result. Clear the result first.';
  END IF;

  DELETE FROM public.tournament_matches WHERE id = ANY (p_match_ids);

  PERFORM public._insert_round_matches(
    p_tournament_id, v_workspace_id, p_round_number, p_matches
  );

  UPDATE public.tournament_matches
  SET pairings_published = false
  WHERE tournament_id = p_tournament_id
    AND round_number  = p_round_number
    AND status        = 'ready';
END;
$function$
