CREATE OR REPLACE FUNCTION public.purge_expired_personal_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Audit log: 12-month retention
  PERFORM public.cleanup_audit_log(365);

  -- Invites: keep only actionable ones. Accepted/revoked invites are spent
  -- immediately; expired pending invites get a 30-day grace period in case
  -- the owner wants to see who never responded.
  DELETE FROM public.workspace_invites
  WHERE status IN ('accepted', 'revoked', 'expired')
     OR (status = 'pending' AND expires_at < now() - INTERVAL '30 days');
END;
$function$
