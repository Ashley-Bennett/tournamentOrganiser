CREATE OR REPLACE FUNCTION public.set_tournament_join_enabled(p_tournament_id uuid, p_enabled boolean)
 RETURNS TABLE(join_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id  UUID;
  v_existing_code TEXT;
  v_new_code      TEXT;
BEGIN
  SELECT t.workspace_id, t.join_code
    INTO v_workspace_id, v_existing_code
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Only workspace owner/admin may toggle self-registration.
  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  IF p_enabled THEN
    IF v_existing_code IS NULL THEN
      v_new_code := generate_join_code();
    ELSE
      v_new_code := v_existing_code;
    END IF;

    UPDATE public.tournaments
    SET join_enabled = TRUE, join_code = v_new_code
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_new_code;
  ELSE
    UPDATE public.tournaments
    SET join_enabled = FALSE
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_existing_code;
  END IF;
END;
$function$
