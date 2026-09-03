CREATE OR REPLACE FUNCTION public.resolve_join_code(p_code text)
 RETURNS TABLE(tournament_id uuid, tournament_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name
  FROM tournaments t
  WHERE upper(t.join_code) = upper(p_code)
    AND t.status = 'draft'
    AND t.join_enabled = TRUE
  LIMIT 1;
END;
$function$
