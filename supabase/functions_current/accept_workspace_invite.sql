CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite       public.workspace_invites;
  v_caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
    FROM public.workspace_invites
    WHERE token = p_token
      AND status = 'pending'
      AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or expired';
  END IF;

  -- The invite is bound to a specific email address. Reject callers
  -- whose account email does not match (prevents forwarded-link abuse).
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invite was issued to a different email address';
  END IF;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
    VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
    SET status = 'accepted'
    WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$function$
