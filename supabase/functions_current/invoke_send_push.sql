CREATE OR REPLACE FUNCTION public.invoke_send_push(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url   TEXT;
  v_token TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'send_push_url' LIMIT 1;
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets WHERE name = 'send_push_token' LIMIT 1;

    IF v_url IS NULL OR v_token IS NULL THEN
      RETURN;  -- not configured yet — do nothing
    END IF;

    PERFORM net.http_post(
      url     := v_url,
      body    := p_payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a notification failure roll back the caller's transaction.
    RAISE WARNING 'invoke_send_push failed: %', SQLERRM;
  END;
END;
$function$
