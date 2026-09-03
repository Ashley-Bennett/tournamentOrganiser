CREATE OR REPLACE FUNCTION public.link_organiser_push(p_endpoint text, p_p256dh text, p_auth text, p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_id UUID;
  v_ws     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_ws FROM public.tournaments WHERE id = p_tournament_id;
  IF v_ws IS NULL OR NOT public.can_manage_workspace(v_ws) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.push_subscriptions (endpoint, p256dh, auth, user_id, last_seen_at)
  VALUES (p_endpoint, p_p256dh, p_auth, auth.uid(), now())
  ON CONFLICT (endpoint) DO UPDATE
    SET p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_id      = COALESCE(EXCLUDED.user_id, public.push_subscriptions.user_id),
        last_seen_at = now()
  RETURNING id INTO v_sub_id;

  DELETE FROM public.push_subscription_targets
  WHERE subscription_id = v_sub_id
    AND tournament_id = p_tournament_id
    AND is_organiser = true;

  INSERT INTO public.push_subscription_targets
    (subscription_id, tournament_id, tournament_player_id, is_organiser)
  VALUES (v_sub_id, p_tournament_id, NULL, true);
END;
$function$
