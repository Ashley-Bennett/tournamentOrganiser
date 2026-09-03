CREATE OR REPLACE FUNCTION public.get_record_change_counts(p_table_name text, p_record_ids uuid[])
 RETURNS TABLE(record_id uuid, change_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_supported CONSTANT TEXT[] := ARRAY[
    'tournaments', 'tournament_players', 'tournament_matches',
    'workspace_memberships', 'tournament_player_claims'
  ];
BEGIN
  IF NOT (p_table_name = ANY (c_supported)) THEN
    RAISE EXCEPTION 'Unknown or unsupported table: %', p_table_name;
  END IF;

  IF p_record_ids IS NULL OR array_length(p_record_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT r.id, count(*)::INTEGER
      FROM public.%I r
      JOIN public.audit_log a
        ON a.table_name = %L
       AND a.record_id  = r.id
       AND a.operation <> 'INSERT'
     WHERE r.id = ANY($1)
       AND public.is_workspace_member(r.workspace_id)
     GROUP BY r.id
  $q$, p_table_name, p_table_name)
  USING p_record_ids;
END;
$function$
