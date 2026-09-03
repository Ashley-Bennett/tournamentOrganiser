CREATE OR REPLACE FUNCTION public._apply_late_entry_pairing_unchecked(p_player_id uuid, p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id     UUID;
  v_max_round        INTEGER;
  v_round_has_begun  BOOLEAN;
  v_round_complete   BOOLEAN;
  v_pre_begin_round  BOOLEAN;
  v_round_count      INTEGER;
  v_missed_rounds    INTEGER;
  v_existing_bye_id  UUID;
  v_bye_player_id    UUID;
  v_joiner_name      TEXT;
BEGIN
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT tp.name INTO v_joiner_name
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  SELECT COALESCE(MAX(m.round_number), 1) INTO v_max_round
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id;

  -- Snapshot the current round BEFORE inserting anything, so the new player's
  -- own rows can never be mistaken for an existing bye.
  SELECT
    COUNT(*),
    BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL)),
    BOOL_AND(m.status IN ('completed', 'bye'))
  INTO v_round_count, v_round_has_begun, v_round_complete
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number = v_max_round;

  v_round_has_begun := COALESCE(v_round_has_begun, FALSE);
  v_round_complete  := v_round_count > 0 AND COALESCE(v_round_complete, FALSE);
  v_pre_begin_round := v_round_count > 0 AND NOT v_round_has_begun AND NOT v_round_complete;

  SELECT m.id, m.player1_id INTO v_existing_bye_id, v_bye_player_id
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number = v_max_round
    AND m.player2_id IS NULL
    AND m.player1_id <> p_player_id
  ORDER BY m.match_number NULLS LAST
  LIMIT 1;

  -- A loss for every round already finished. When the joiner cannot be paired
  -- into the current round either, that round is a loss too — never a free bye.
  v_missed_rounds := CASE
    WHEN v_round_complete THEN v_max_round
    WHEN v_existing_bye_id IS NULL THEN v_max_round   -- sits this round out
    ELSE v_max_round - 1                              -- absorbs the waiting bye
  END;

  IF v_missed_rounds > 0 THEN
    INSERT INTO public.tournament_matches (
      tournament_id, workspace_id, round_number, match_number,
      player1_id, player2_id, status, result, winner_id
    )
    SELECT
      p_tournament_id, v_workspace_id, r, NULL,
      p_player_id, NULL, 'completed', 'loss', NULL
    FROM generate_series(1, v_missed_rounds) AS r;
  END IF;

  -- Pair into the round only when someone is already waiting on a bye.
  IF v_existing_bye_id IS NOT NULL AND (v_pre_begin_round OR (v_round_has_begun AND NOT v_round_complete)) THEN
    UPDATE public.tournament_matches
    SET player2_id = p_player_id,
        status     = CASE WHEN v_pre_begin_round THEN 'ready' ELSE 'pending' END,
        result     = NULL,
        winner_id  = NULL
    WHERE id = v_existing_bye_id;

    -- Their bye just vanished — and if the round was already under way, so did
    -- the 3 points it had put on the board. Tell them.
    PERFORM public.invoke_send_push(jsonb_build_object(
      'type',          'bye_paired',
      'tournament_id', p_tournament_id,
      'round',         v_max_round,
      'player_id',     v_bye_player_id,
      'player_name',   v_joiner_name
    ));
  END IF;
  -- Otherwise: no pairing this round. The loss rows above stand.
END;
$function$
