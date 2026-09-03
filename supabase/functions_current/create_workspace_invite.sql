CREATE OR REPLACE FUNCTION public.create_workspace_invite(p_workspace_id uuid, p_email text, p_role text DEFAULT 'admin'::text)
 RETURNS workspace_invites
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_invite      public.workspace_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite as owner';
  END IF;

  v_caller_role := public.get_workspace_role(p_workspace_id);

  IF public.get_role_rank(v_caller_role) <= public.get_role_rank(p_role) THEN
    RAISE EXCEPTION 'Insufficient permissions to invite role %', p_role;
  END IF;

  -- Revoke any existing pending invite for this workspace+email before creating a fresh one
  UPDATE public.workspace_invites
    SET status = 'revoked'
    WHERE workspace_id = p_workspace_id
      AND lower(email) = lower(p_email)
      AND status = 'pending';

  INSERT INTO public.workspace_invites (workspace_id, email, role, invited_by)
    VALUES (p_workspace_id, lower(p_email), p_role, auth.uid())
    RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$function$
