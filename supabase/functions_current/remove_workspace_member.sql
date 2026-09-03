CREATE OR REPLACE FUNCTION public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  v_caller_role := public.get_workspace_role(p_workspace_id);

  SELECT role INTO v_target_role
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member';
  END IF;

  -- Explicitly block removing the workspace owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove workspace owner';
  END IF;

  -- Caller must outrank target
  IF public.get_role_rank(v_caller_role) <= public.get_role_rank(v_target_role) THEN
    RAISE EXCEPTION 'Insufficient permissions to remove this member';
  END IF;

  DELETE FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$function$
