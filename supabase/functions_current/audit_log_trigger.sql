CREATE OR REPLACE FUNCTION public.audit_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Keys never written to the audit log, on any audited table.
  c_redacted CONSTANT TEXT[] := ARRAY['device_token', 'device_id'];
  -- Primary key column, passed when the table's key is not 'id'.
  v_key_col   TEXT := COALESCE(TG_ARGV[0], 'id');
  v_record_id UUID;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_record_id := (to_jsonb(NEW) ->> v_key_col)::UUID;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (to_jsonb(NEW) ->> v_key_col)::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := to_jsonb(NEW) - c_redacted;
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> v_key_col)::UUID;
    v_old_data  := to_jsonb(OLD) - c_redacted;
    v_new_data  := NULL;
  END IF;

  INSERT INTO public.audit_log (
    table_name, record_id, operation, user_id, actor_label, old_data, new_data
  )
  VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP,
    (SELECT auth.uid()),
    NULLIF(current_setting('app.actor_label', true), ''),
    v_old_data, v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$
