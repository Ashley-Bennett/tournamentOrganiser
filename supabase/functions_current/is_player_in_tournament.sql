CREATE OR REPLACE FUNCTION public.is_player_in_tournament(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND user_id = auth.uid()
  );
$function$
