-- ============================================================
-- Persistent audit logging
--
-- Creates an audit_log table that stores every INSERT/UPDATE/DELETE
-- on the key tournament tables. Data lives in your own database
-- with no automatic expiry — completely bypassing Supabase's
-- 24-hour log retention.
--
-- Tables audited:
--   - public.tournaments
--   - public.tournament_players
--   - public.tournament_matches
-- ============================================================

-- 1. Audit log table
CREATE TABLE public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT        NOT NULL,
  record_id   UUID,
  operation   TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     UUID,
  old_data    JSONB,
  new_data    JSONB,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by user (most common query pattern)
CREATE INDEX audit_log_user_changed_idx
  ON public.audit_log (user_id, changed_at DESC);

-- Fast lookup by table + record (drill into one entity's history)
CREATE INDEX audit_log_table_record_idx
  ON public.audit_log (table_name, record_id, changed_at DESC);

-- 2. RLS — users can only read their own audit entries; no direct writes
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_own" ON public.audit_log
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- 3. Generic trigger function
--    SECURITY DEFINER so it can INSERT into audit_log regardless of RLS.
--    auth.uid() still resolves correctly because request.jwt.claims is a
--    session-level setting that persists through SECURITY DEFINER calls.
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_record_id := (to_jsonb(NEW) ->> 'id')::UUID;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (to_jsonb(NEW) ->> 'id')::UUID;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> 'id')::UUID;
    v_old_data  := to_jsonb(OLD);
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

-- 4. Attach to key tables
CREATE TRIGGER audit_tournaments
  AFTER INSERT OR UPDATE OR DELETE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_tournament_players
  AFTER INSERT OR UPDATE OR DELETE ON public.tournament_players
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_tournament_matches
  AFTER INSERT OR UPDATE OR DELETE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- 5. Optional retention cleanup
--    Call manually or via pg_cron to prune old entries.
--    Returns the number of rows deleted.
--    Example: SELECT public.cleanup_audit_log(90); -- keep last 90 days
CREATE OR REPLACE FUNCTION public.cleanup_audit_log(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.audit_log
  WHERE changed_at < now() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
