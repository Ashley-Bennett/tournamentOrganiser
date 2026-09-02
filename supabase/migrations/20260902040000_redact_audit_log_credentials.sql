-- ============================================================
-- Audit log: redact player credentials, index the retention scan
-- (2026-09-02)
--
-- 1. audit_log_trigger() writes to_jsonb(NEW) — every column of the
--    row, whatever it happens to be. When it was written (2026-03-08)
--    tournament_players had no secrets in it. device_token and
--    device_id arrived eighteen days later, in
--    20260326000000_tournament_self_registration.sql, and have been
--    copied into audit_log on every player INSERT and UPDATE since.
--
--    20260719205753 locked the token away from clients by revoking
--    the table-level SELECT grant and re-granting an explicit column
--    list. That does not reach here: column privileges are not
--    consulted inside a SECURITY DEFINER trigger, and audit_log has
--    its own grants. So the token was still readable — an organiser
--    who drops a player, sets their deck, or edits a self-registered
--    entry becomes the auth.uid() stamped on that audit row, and
--    audit_log_select_own then hands the row back to them, token
--    included. That is enough to submit results as that player and to
--    claim their entry via self_claim_player_entry: exactly the
--    impersonation route 20260719205753 was written to close.
--
--    Fix: strip the credential keys before the INSERT, and scrub the
--    rows already stored. The redaction list is applied to every
--    audited table — removing a key that isn't there is a no-op, so
--    this keeps working if a token column ever moves or is added
--    elsewhere.
--
--    Note that this is deliberately lossy. The audit log records that
--    a player row changed and who changed it; it is not a place to
--    recover a lost token from, and the backfill below destroys any
--    historical copies. Tokens themselves live on tournament_players.
--
-- 2. cleanup_audit_log() deletes on changed_at, but both existing
--    indexes lead with another column (user_id, table_name), so the
--    nightly purge_expired_personal_data() cron job at 03:10 has no
--    usable index and sequentially scans what is by some distance the
--    largest table in the database. Add the index it wants.
-- ============================================================

-- 1. Trigger function — same behaviour, credentials removed
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Keys never written to the audit log, on any audited table.
  c_redacted CONSTANT TEXT[] := ARRAY['device_token', 'device_id'];
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_record_id := (to_jsonb(NEW) ->> 'id')::UUID;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (to_jsonb(NEW) ->> 'id')::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> 'id')::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := NULL;
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, operation, user_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, (SELECT auth.uid()), v_old_data, v_new_data);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Scrub credentials already written. Scoped by the key test rather
--    than by table_name so it covers every row that actually holds one.
UPDATE public.audit_log
   SET old_data = old_data - ARRAY['device_token', 'device_id'],
       new_data = new_data - ARRAY['device_token', 'device_id']
 WHERE old_data ?| ARRAY['device_token', 'device_id']
    OR new_data ?| ARRAY['device_token', 'device_id'];

-- 3. Index the retention predicate
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx
  ON public.audit_log (changed_at);
