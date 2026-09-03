CREATE OR REPLACE FUNCTION public.dismiss_merge_suggestion(p_workspace_id uuid, p_key_a text, p_key_b text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_lo  TEXT := LEAST(p_key_a, p_key_b);
  v_hi  TEXT := GREATEST(p_key_a, p_key_b);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can dismiss duplicate suggestions';
  END IF;
  IF v_lo = v_hi THEN
    RAISE EXCEPTION 'A player cannot be marked as not the same as themselves';
  END IF;

  INSERT INTO public.workspace_player_merge_dismissals
    (workspace_id, key_a, key_b, created_by)
  VALUES (p_workspace_id, v_lo, v_hi, v_uid)
  ON CONFLICT (workspace_id, key_a, key_b) DO NOTHING;
END;
$function$
