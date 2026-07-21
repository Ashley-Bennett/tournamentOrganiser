-- ============================================================
-- Scheduled personal-data retention (GDPR storage limitation)
--
--   - audit_log rows older than 12 months are purged via the
--     existing cleanup_audit_log() helper
--   - workspace_invites that are no longer actionable (accepted /
--     revoked, or pending but expired for 30+ days) are deleted so
--     invitee email addresses don't accumulate indefinitely
--
-- Runs daily at 03:10 UTC via pg_cron.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_personal_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
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
$$;

-- Not callable by clients — cron only
REVOKE ALL ON FUNCTION public.purge_expired_personal_data() FROM PUBLIC, anon, authenticated;

-- Idempotent scheduling: drop any previous job with this name first
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-personal-data') THEN
    PERFORM cron.unschedule('purge-expired-personal-data');
  END IF;
END;
$$;

SELECT cron.schedule(
  'purge-expired-personal-data',
  '10 3 * * *',
  $$SELECT public.purge_expired_personal_data()$$
);
