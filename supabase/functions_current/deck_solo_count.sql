CREATE OR REPLACE FUNCTION public.deck_solo_count(p_pokemon integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::INT
  FROM public.tournament_players tp
  WHERE public.deck_norm(tp.deck_pokemon1, tp.deck_pokemon2) = ARRAY[p_pokemon]
$function$
