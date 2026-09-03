CREATE OR REPLACE FUNCTION public.get_workspace_merge_suggestions(p_workspace_id uuid, p_threshold real DEFAULT 0.4)
 RETURNS TABLE(key_a text, name_a text, events_a integer, linked_a boolean, key_b text, name_b text, events_b integer, linked_b boolean, similarity real)
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
      BOOL_OR(i.is_linked) AS linked,
      COUNT(DISTINCT i.tournament_id)::INT AS events
    FROM public.workspace_player_identities(p_workspace_id) i
    GROUP BY i.identity_key
  )
  SELECT
    a.k, a.nm, a.events, a.linked,
    b.k, b.nm, b.events, b.linked,
    extensions.similarity(LOWER(a.nm), LOWER(b.nm)) AS sim
  FROM people a
  JOIN people b
    -- a.k < b.k gives each pair once, in the same order the dismissal
    -- table stores them.
    ON a.k < b.k
   AND NOT (a.linked AND b.linked)
  WHERE extensions.similarity(LOWER(a.nm), LOWER(b.nm)) >= p_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_player_merge_dismissals d
      WHERE d.workspace_id = p_workspace_id
        AND d.key_a = a.k
        AND d.key_b = b.k
    )
  ORDER BY sim DESC, a.nm
  LIMIT 100;
END;
$function$
