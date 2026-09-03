CREATE OR REPLACE FUNCTION public.accept_player_claim_link(p_token text)
 RETURNS TABLE(workspace_id uuid, workspace_slug text, tournament_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim        public.tournament_player_claims%ROWTYPE;
  v_tournament_id UUID;
  v_slug         TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_claim
  FROM public.tournament_player_claims
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already used claim link';
  END IF;

  -- Reject if already linked
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = v_claim.tournament_player_id
      AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player entry is already linked to an account';
  END IF;

  -- Link the player entry to the claiming user
  UPDATE public.tournament_players
  SET user_id = auth.uid()
  WHERE id = v_claim.tournament_player_id;

  -- Add to workspace known-players directory.
  -- ON CONFLICT DO NOTHING (no column list) avoids ambiguity between the
  -- output parameter also named workspace_id and the table column.
  INSERT INTO public.workspace_players (workspace_id, user_id)
  VALUES (v_claim.workspace_id, auth.uid())
  ON CONFLICT DO NOTHING;

  -- Mark claim accepted
  UPDATE public.tournament_player_claims
  SET status = 'accepted'
  WHERE id = v_claim.id;

  -- Gather return values
  SELECT tp.tournament_id, w.slug
  INTO v_tournament_id, v_slug
  FROM public.tournament_players tp
  JOIN public.workspaces w ON w.id = v_claim.workspace_id
  WHERE tp.id = v_claim.tournament_player_id;

  RETURN QUERY SELECT v_claim.workspace_id, v_slug, v_tournament_id;
END;
$function$
