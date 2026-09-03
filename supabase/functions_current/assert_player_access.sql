CREATE OR REPLACE FUNCTION public.assert_player_access(p_player_id uuid, p_tournament_id uuid, p_device_token text)
 RETURNS tournament_players
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_player public.tournament_players%ROWTYPE;
BEGIN
  SELECT * INTO v_player
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id
    AND (p_tournament_id IS NULL OR tp.tournament_id = p_tournament_id)
    AND (
      -- Anonymous / device-bound access: holder of the row's secret.
      (p_device_token IS NOT NULL AND tp.device_token = p_device_token)
      OR
      -- Account-bound access: signed in as the linked user.
      (auth.uid() IS NOT NULL AND tp.user_id = auth.uid())
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid player credentials';
  END IF;

  -- Attribute everything this transaction goes on to write. Harmless when
  -- the caller is signed in — user_id is recorded too, and is preferred.
  PERFORM public.set_audit_actor('player:' || v_player.id);

  RETURN v_player;
END;
$function$
