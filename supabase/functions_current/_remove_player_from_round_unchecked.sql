CREATE OR REPLACE FUNCTION public._remove_player_from_round_unchecked(p_player_id uuid, p_tournament_id uuid, p_round integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id    UUID;
  v_match           RECORD;
  v_opponent_id     UUID;
  v_round_count     INTEGER;
  v_round_has_begun BOOLEAN;
  v_round_complete  BOOLEAN;
  v_round_settled   BOOLEAN;
  v_player_name     TEXT;
BEGIN
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT m.* INTO v_match
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number  = p_round
    AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
  LIMIT 1;

  -- Not in this round at all: nothing to do.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Snapshot the round BEFORE deleting anything, so the row we are about to
  -- remove cannot change our reading of whether play has started.
  SELECT
    COUNT(*),
    BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL)),
    BOOL_AND(m.status IN ('completed', 'bye'))
  INTO v_round_count, v_round_has_begun, v_round_complete
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number  = p_round;

  v_round_has_begun := COALESCE(v_round_has_begun, FALSE);
  v_round_complete  := v_round_count > 0 AND COALESCE(v_round_complete, FALSE);
  v_round_settled   := v_round_has_begun OR v_round_complete;

  v_opponent_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  SELECT tp.name INTO v_player_name
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  -- Delete then re-insert rather than UPDATE: the opponent has to become
  -- player1, and the unique (tournament, round, player1) index would fire
  -- mid-statement if both rows existed at once.
  DELETE FROM public.tournament_matches WHERE id = v_match.id;

  -- They were sitting on a bye — no opponent to repair.
  IF v_opponent_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.tournament_matches (
    tournament_id, workspace_id, round_number, match_number,
    player1_id, player2_id, status, result, winner_id,
    temp_winner_id, temp_result, pairings_published, pairing_decision_log
  )
  VALUES (
    p_tournament_id, v_workspace_id, p_round, v_match.match_number,
    v_opponent_id, NULL,
    CASE WHEN v_round_settled THEN 'bye' ELSE 'ready' END,
    CASE WHEN v_round_settled THEN 'bye' ELSE NULL END,
    CASE WHEN v_round_settled THEN v_opponent_id ELSE NULL END,
    NULL, NULL,
    COALESCE(v_match.pairings_published, FALSE),
    v_match.pairing_decision_log
  );

  -- Their opponent has vanished from under them. If pairings were already up
  -- they are standing at a table waiting, so this has to reach them.
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'opponent_removed',
    'tournament_id', p_tournament_id,
    'round',         p_round,
    'player_id',     v_opponent_id,
    'player_name',   v_player_name
  ));
END;
$function$
