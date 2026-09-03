CREATE OR REPLACE FUNCTION public.begin_tournament_round(p_tournament_id uuid, p_round_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_duration     INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id, t.round_duration_minutes
    INTO v_workspace_id, v_duration
  FROM public.tournaments t WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF public.get_workspace_role(v_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  -- ON CONFLICT DO NOTHING: re-beginning a round must not reset its clock.
  INSERT INTO public.tournament_rounds
    (tournament_id, round_number, workspace_id, started_at, duration_minutes)
  VALUES
    (p_tournament_id, p_round_number, v_workspace_id, now(), v_duration)
  ON CONFLICT (tournament_id, round_number) DO NOTHING;
END;
$function$
