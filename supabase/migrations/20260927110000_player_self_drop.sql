-- ── Players dropping themselves ──────────────────────────────────────────────
-- Until now only an organiser could drop a player, so someone leaving early had
-- to find the organiser (or just vanish, leaving their next opponent waiting on
-- a no-show). This lets a player drop themselves from the player view.
--
-- Dropping is a concession, not a disappearance. If the player is paired in the
-- latest round against a real opponent and that match has no result yet (no
-- report from either side, nothing entered by the organiser), the drop is
-- recorded exactly as if they had reported a loss. Their opponent gets a WIN,
-- not a bye: a bye counts differently in tiebreakers, and the opponent should
-- not be penalised for someone else leaving. The organiser confirms it with the
-- rest of the round's results, as with any player report.
--
-- A result that is already in (reported, agreed or confirmed) is left alone —
-- it stands, and the drop only keeps them out of later rounds.
--
-- The one case that still removes them from the round: they were sitting on a
-- bye in a round that has not begun. A bye nobody has to play is not a game
-- they conceded, so it is taken back rather than banked as a free win.
--
-- Either way they are excluded from every later pairing, exactly like an
-- organiser drop. Undoing it stays with the organiser (Restore in the player
-- list) — a player cannot un-drop themselves back into an event.

CREATE OR REPLACE FUNCTION public.self_drop_from_tournament(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player          public.tournament_players%ROWTYPE;
  v_status          TEXT;
  v_round           INTEGER;
  v_round_has_begun BOOLEAN;
  v_match           RECORD;
  v_opponent_id     UUID;
  v_result_str      TEXT;
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

  v_dropped_after := v_round;

  IF v_round IS NOT NULL THEN
    SELECT COALESCE(BOOL_OR(
      m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL)
    ), FALSE)
    INTO v_round_has_begun
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = v_round;

    SELECT m.* INTO v_match
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = v_round
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
    LIMIT 1;

    IF NOT FOUND THEN
      -- Not paired in the latest round; if it has not begun they left before it.
      IF NOT v_round_has_begun THEN
        v_dropped_after := NULLIF(v_round - 1, 0);
      END IF;

    ELSIF v_match.player2_id IS NULL THEN
      -- An unplayed bye is handed back; one already awarded stands.
      IF v_match.status = 'ready' AND NOT v_round_has_begun THEN
        PERFORM public._remove_player_from_round_unchecked(
          p_player_id, p_tournament_id, v_round
        );
        v_dropped_after := NULLIF(v_round - 1, 0);
      END IF;

    ELSIF v_match.status NOT IN ('completed', 'bye')
      AND v_match.temp_result IS NULL
      AND v_match.result IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.match_result_reports r WHERE r.match_id = v_match.id
      )
    THEN
      -- No result yet: record it as this player reporting a loss, the same
      -- shape submit_match_result writes for a first report.
      v_opponent_id := CASE
        WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
        ELSE v_match.player1_id
      END;
      v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;

      INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
      VALUES (v_match.id, p_player_id, 'loss');

      UPDATE public.tournament_matches
      SET winner_id      = v_opponent_id,
          result         = v_result_str,
          temp_winner_id = v_opponent_id,
          temp_result    = v_result_str,
          confirmed_by   = 'player_report'
      WHERE id = v_match.id;

      PERFORM public.invoke_send_push(jsonb_build_object(
        'type',          'opponent_dropped',
        'tournament_id', p_tournament_id,
        'round',         v_round,
        'player_id',     v_opponent_id,
        'player_name',   v_player.name
      ));
    END IF;
  END IF;

  UPDATE public.tournament_players
  SET dropped          = TRUE,
      dropped_at_round = v_dropped_after
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id;

  -- The organiser's round just changed underneath them.
  PERFORM public.invoke_send_push(jsonb_build_object(
    'type',          'player_dropped',
    'tournament_id', p_tournament_id,
    'round',         v_round,
    'player_name',   v_player.name
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.self_drop_from_tournament(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.self_drop_from_tournament(UUID, UUID, TEXT) TO anon, authenticated;
