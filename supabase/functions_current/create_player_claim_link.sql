CREATE OR REPLACE FUNCTION public.create_player_claim_link(p_tournament_player_id uuid)
 RETURNS TABLE(token text, claim_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_token        TEXT;
  v_claim_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_players
  WHERE id = p_tournament_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can create claim links';
  END IF;

  -- Revoke any existing pending claim for this player
  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE tournament_player_id = p_tournament_player_id
    AND status = 'pending';

  -- Let the column DEFAULT (encode(gen_random_bytes(32), 'hex')) generate the token.
  INSERT INTO public.tournament_player_claims (tournament_player_id, workspace_id, created_by)
  VALUES (p_tournament_player_id, v_workspace_id, auth.uid())
  RETURNING id, tournament_player_claims.token INTO v_claim_id, v_token;

  RETURN QUERY SELECT v_token, v_claim_id;
END;
$function$
