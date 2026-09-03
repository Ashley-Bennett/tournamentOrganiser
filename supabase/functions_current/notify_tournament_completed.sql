CREATE OR REPLACE FUNCTION public.notify_tournament_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type', 'standings_ready',
    'tournament_id', NEW.id
  ));
  RETURN NULL;
END;
$function$
