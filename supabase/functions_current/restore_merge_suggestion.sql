CREATE OR REPLACE FUNCTION public.restore_merge_suggestion(p_workspace_id uuid, p_key_a text, p_key_b text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can restore duplicate suggestions';
  END IF;

  DELETE FROM public.workspace_player_merge_dismissals
  WHERE workspace_id = p_workspace_id
    AND key_a = LEAST(p_key_a, p_key_b)
    AND key_b = GREATEST(p_key_a, p_key_b);
END;
$function$
