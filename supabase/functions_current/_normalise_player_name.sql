CREATE OR REPLACE FUNCTION public._normalise_player_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT btrim(regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$function$
