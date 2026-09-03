CREATE OR REPLACE FUNCTION public.get_my_tournament_entry(p_tournament_id uuid)
 RETURNS TABLE(player_id uuid, device_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT tp.id, tp.device_token
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.user_id = auth.uid()
  LIMIT 1;
END;
$function$
