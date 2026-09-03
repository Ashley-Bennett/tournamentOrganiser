CREATE OR REPLACE FUNCTION public.get_my_badges()
 RETURNS TABLE(badge_id text, badge_count integer, workspace_id uuid, workspace_name text, game_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT b.badge_id, b.badge_count, b.workspace_id, b.workspace_name, b.game_id
  FROM public.badge_counts(ARRAY[auth.uid()]) b;
END;
$function$
