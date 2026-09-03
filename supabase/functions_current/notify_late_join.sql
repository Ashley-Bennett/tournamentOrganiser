CREATE OR REPLACE FUNCTION public.notify_late_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'late_join',
    'tournament_id', NEW.tournament_id,
    'player_name',   NEW.name,
    'round',         NEW.late_entry_round
  ));
  RETURN NULL;
END;
$function$
