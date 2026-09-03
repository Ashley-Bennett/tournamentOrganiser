CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_tournament_player_id uuid, p_device_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_player        public.tournament_players%ROWTYPE;
  v_sub_id        UUID;
  v_tournament_id UUID;
BEGIN
  -- Validate device_token or account ownership
  v_player := public.assert_player_access(p_tournament_player_id, NULL, p_device_token);
  v_tournament_id := v_player.tournament_id;

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
    AND tournament_id = v_tournament_id
    AND is_organiser = false;

  INSERT INTO public.push_subscription_targets
    (subscription_id, tournament_id, tournament_player_id, is_organiser)
  VALUES (v_sub_id, v_tournament_id, p_tournament_player_id, false);
END;
$function$
