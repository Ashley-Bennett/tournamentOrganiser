CREATE OR REPLACE FUNCTION public.revoke_workspace_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_invites
    WHERE id = p_invite_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF NOT public.can_manage_workspace(v_workspace_id) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  UPDATE public.workspace_invites SET status = 'revoked' WHERE id = p_invite_id;
END;
$function$
