CREATE OR REPLACE FUNCTION public.notify_pairings_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT n.tournament_id, n.round_number
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE n.pairings_published AND NOT COALESCE(o.pairings_published, false)
  LOOP
    PERFORM public.invoke_send_push(jsonb_build_object(
      'type', 'pairing_up',
      'tournament_id', r.tournament_id,
      'round', r.round_number
    ));
  END LOOP;
  RETURN NULL;
END;
$function$
