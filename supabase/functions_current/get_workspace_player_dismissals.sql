CREATE OR REPLACE FUNCTION public.get_workspace_player_dismissals(p_workspace_id uuid, p_identity_key text)
 RETURNS TABLE(other_key text, other_name text, other_events integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.get_workspace_role(p_workspace_id) IS NULL THEN
    RAISE EXCEPTION 'Not a member of this workspace';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT
      i.identity_key AS k,
      MAX(i.display_name) AS nm,
      COUNT(DISTINCT i.tournament_id)::INT AS events
    FROM public.workspace_player_identities(p_workspace_id) i
    GROUP BY i.identity_key
  ),
  pairs AS (
    SELECT CASE WHEN d.key_a = p_identity_key THEN d.key_b ELSE d.key_a END AS other
    FROM public.workspace_player_merge_dismissals d
    WHERE d.workspace_id = p_workspace_id
      AND p_identity_key IN (d.key_a, d.key_b)
  )
  SELECT pr.other, p.nm, COALESCE(p.events, 0)
  FROM pairs pr
  LEFT JOIN people p ON p.k = pr.other
  ORDER BY p.nm NULLS LAST;
END;
$function$
