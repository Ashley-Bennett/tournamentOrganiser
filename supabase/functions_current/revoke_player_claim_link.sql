CREATE OR REPLACE FUNCTION public.revoke_player_claim_link(p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_player_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can revoke claim links';
  END IF;

  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE id = p_claim_id AND status = 'pending';
END;
$function$
