CREATE OR REPLACE FUNCTION public.add_known_players_to_tournament(p_tournament_id uuid, p_user_ids uuid[], p_is_late_entry boolean DEFAULT false, p_late_entry_round integer DEFAULT NULL::integer)
 RETURNS TABLE(player_id uuid, name text, created_at timestamp with time zone, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_uid          UUID;
  v_name         TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can add known players';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    -- Validate the user really is a known player in this workspace. Without
    -- this, a manager could link a stranger's account to their tournament.
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_players wp
      WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'User % is not a known player in this workspace', v_uid;
    END IF;

    -- Resolve display name: preferred_name → profile display_name → fallback
    SELECT COALESCE(wp.preferred_name, p.display_name, 'Player')
    INTO v_name
    FROM public.workspace_players wp
    LEFT JOIN public.profiles p ON p.id = wp.user_id
    WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid;

    -- ON CONFLICT DO NOTHING against idx_tournament_players_tournament_user:
    -- a user already in this tournament is silently skipped, so re-adding is safe.
    RETURN QUERY
    INSERT INTO public.tournament_players (
      tournament_id, workspace_id, user_id, name, created_by,
      is_late_entry, late_entry_round
    )
    VALUES (
      p_tournament_id, v_workspace_id, v_uid, v_name, auth.uid(),
      COALESCE(p_is_late_entry, FALSE),
      CASE WHEN COALESCE(p_is_late_entry, FALSE) THEN p_late_entry_round ELSE NULL END
    )
    ON CONFLICT DO NOTHING
    RETURNING
      tournament_players.id,
      tournament_players.name,
      tournament_players.created_at,
      tournament_players.user_id;
  END LOOP;
END;
$function$
