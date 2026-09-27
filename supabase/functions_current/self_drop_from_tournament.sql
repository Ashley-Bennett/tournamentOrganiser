CREATE OR REPLACE FUNCTION public.self_drop_from_tournament(p_tournament_id uuid, p_player_id uuid, p_device_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_player          public.tournament_players%ROWTYPE;
  v_status          TEXT;
  v_round           INTEGER;
  v_round_has_begun BOOLEAN;
  v_round_complete  BOOLEAN;
  v_in_round        BOOLEAN;
  v_dropped_after   INTEGER;
BEGIN
  v_player := public.assert_player_access(p_player_id, p_tournament_id, p_device_token);

  -- Same lock late joins and organiser round edits take, so the round cannot
  -- be started or re-paired while we decide what to do with it.
  SELECT t.status INTO v_status
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'You can only drop from a tournament that is in progress.';
  END IF;

  IF v_player.dropped THEN
    RAISE EXCEPTION 'You have already dropped from this tournament.';
  END IF;

  SELECT MAX(m.round_number) INTO v_round
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id;

  IF v_round IS NOT NULL THEN
    SELECT
      BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL)),
      BOOL_AND(m.status IN ('completed', 'bye')),
      BOOL_OR(m.player1_id = p_player_id OR m.player2_id = p_player_id)
    INTO v_round_has_begun, v_round_complete, v_in_round
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = v_round;

    IF NOT COALESCE(v_round_has_begun, FALSE)
       AND NOT COALESCE(v_round_complete, FALSE) THEN
      IF COALESCE(v_in_round, FALSE) THEN
        PERFORM public._remove_player_from_round_unchecked(
          p_player_id, p_tournament_id, v_round
        );
      END IF;
      v_dropped_after := NULLIF(v_round - 1, 0);
    ELSE
      v_dropped_after := v_round;
    END IF;
  END IF;

  UPDATE public.tournament_players
  SET dropped          = TRUE,
      dropped_at_round = v_dropped_after
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id;

  -- The organiser's pairings just changed underneath them.
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'player_dropped',
    'tournament_id', p_tournament_id,
    'round',         v_round,
    'player_name',   v_player.name
  ));
END;
$function$
