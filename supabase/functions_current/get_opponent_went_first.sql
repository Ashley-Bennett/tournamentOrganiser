CREATE OR REPLACE FUNCTION public.get_opponent_went_first(p_match_ids uuid[])
 RETURNS TABLE(match_id uuid, went_first boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT mi.match_id, mi.went_first
  FROM public.match_insights mi
  JOIN public.tournament_matches tm ON tm.id = mi.match_id
  JOIN public.tournament_players me
    ON me.tournament_id = tm.tournament_id
   AND me.user_id = auth.uid()
   AND (tm.player1_id = me.id OR tm.player2_id = me.id)
  WHERE mi.match_id = ANY(p_match_ids)
    AND mi.player_id <> auth.uid();
END;
$function$
