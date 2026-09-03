CREATE OR REPLACE FUNCTION public.end_tournament_round(p_tournament_id uuid, p_round_number integer)
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

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t WHERE t.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  -- Ending while paused folds the outstanding pause in, so no time is lost.
  UPDATE public.tournament_rounds
     SET ended_at       = now(),
         paused_seconds = paused_seconds
                        + CASE
                            WHEN paused_at IS NOT NULL
                            THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - paused_at)))::INT)
                            ELSE 0
                          END,
         paused_at      = NULL
   WHERE tournament_id = p_tournament_id
     AND round_number  = p_round_number
     AND ended_at IS NULL;
END;
$function$
