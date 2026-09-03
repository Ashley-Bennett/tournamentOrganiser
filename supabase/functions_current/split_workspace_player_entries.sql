CREATE OR REPLACE FUNCTION public.split_workspace_player_entries(p_workspace_id uuid, p_entry_ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT := 'manual:' || gen_random_uuid()::TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can separate players';
  END IF;

  INSERT INTO public.workspace_player_links
    (tournament_player_id, workspace_id, canonical_key, created_by)
  SELECT tp.id, p_workspace_id, v_key, v_uid
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.id = ANY(p_entry_ids)
    -- Scoped to the workspace so an id from elsewhere cannot be dragged in.
    AND t.workspace_id = p_workspace_id
  ON CONFLICT (tournament_player_id)
  DO UPDATE SET canonical_key = EXCLUDED.canonical_key,
                created_by    = EXCLUDED.created_by,
                created_at    = now();

  RETURN v_key;
END;
$function$
