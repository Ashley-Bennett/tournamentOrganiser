CREATE OR REPLACE FUNCTION public.deck_entered(p1 integer, p2 integer)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN cardinality(public.deck_norm(p1, p2)) = 1 THEN public.deck_norm(p1, p2)
    ELSE ARRAY[p1, p2]
  END
$function$
