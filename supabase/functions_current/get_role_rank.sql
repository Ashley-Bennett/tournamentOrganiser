CREATE OR REPLACE FUNCTION public.get_role_rank(p_role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE p_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'judge' THEN 2
    WHEN 'staff' THEN 1
    ELSE 0
  END;
$function$
