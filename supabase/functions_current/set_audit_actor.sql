CREATE OR REPLACE FUNCTION public.set_audit_actor(p_label text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.actor_label', COALESCE(p_label, ''), true);
END;
$function$
