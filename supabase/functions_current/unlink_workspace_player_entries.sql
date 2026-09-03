CREATE OR REPLACE FUNCTION public.unlink_workspace_player_entries(p_workspace_id uuid, p_entry_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_affected INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can undo player merges';
  END IF;

  DELETE FROM public.workspace_player_links
  WHERE workspace_id = p_workspace_id
    AND tournament_player_id = ANY(p_entry_ids);

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$function$
