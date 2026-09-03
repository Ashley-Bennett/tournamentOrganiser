CREATE OR REPLACE FUNCTION public.merge_workspace_players(p_workspace_id uuid, p_source_keys text[], p_target_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      UUID := auth.uid();
  v_target   TEXT;
  v_affected INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(public.get_workspace_role(p_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can merge players';
  END IF;
  IF p_target_key = ANY(p_source_keys) THEN
    RAISE EXCEPTION 'Cannot merge a player into themselves';
  END IF;

  -- Follow one hop if the target has itself been merged, so a chain of merges
  -- collapses to a single canonical key rather than leaving a dangling pointer.
  SELECT COALESCE(MAX(l.canonical_key), p_target_key) INTO v_target
  FROM public.workspace_player_identities(p_workspace_id) i
  JOIN public.workspace_player_links l ON l.tournament_player_id = i.tournament_player_id
  WHERE i.identity_key = p_target_key;

  WITH affected AS (
    SELECT i.tournament_player_id AS tpid
    FROM public.workspace_player_identities(p_workspace_id) i
    WHERE i.identity_key = ANY(p_source_keys)
  )
  INSERT INTO public.workspace_player_links
    (tournament_player_id, workspace_id, canonical_key, created_by)
  SELECT a.tpid, p_workspace_id, v_target, v_uid
  FROM affected a
  ON CONFLICT (tournament_player_id)
  DO UPDATE SET canonical_key = EXCLUDED.canonical_key,
                created_by    = EXCLUDED.created_by,
                created_at    = now();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$function$
