CREATE OR REPLACE FUNCTION public.request_player_entry_link(p_tournament_id uuid, p_entry_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
  v_name      TEXT;
  v_round     INTEGER;
BEGIN
  SELECT tp.id, tp.name INTO v_player_id, v_name
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.created_by IS NOT NULL
    AND lower(tp.name) = lower(btrim(COALESCE(p_entry_name, '')))
  LIMIT 1;

  -- No such entry. Return quietly rather than erroring, so this cannot be used
  -- to probe which names are registered.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- One ping per entry per 10 minutes, so repeated taps cannot spam a running
  -- event. The flag itself stays set for the organiser to act on.
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE id = v_player_id
      AND link_requested_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.tournament_players
  SET link_requested_at = now()
  WHERE id = v_player_id;

  SELECT COALESCE(MAX(m.round_number), 1) INTO v_round
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id;

  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'link_request',
    'tournament_id', p_tournament_id,
    'round',         v_round,
    'player_id',     v_player_id,
    'player_name',   v_name
  ));
END;
$function$
