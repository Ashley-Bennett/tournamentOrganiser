-- ── Removing a player from a live round ──────────────────────────────────────
-- Until now an organiser had exactly two levers once a tournament was active:
--
--   * Drop — flips tournament_players.dropped, which only takes effect at the
--     NEXT pairing generation. The player stays sitting in the round that is
--     already published.
--   * Delete player — hard-gated to draft in the UI.
--
-- So a player who should not be in the current round (a duplicate entry, a
-- no-show, a DQ) could not be taken out of it. The observed workaround was to
-- invent a fake opponent for the odd player to "play", then drop the extra
-- entry a round later — which leaves junk in the standings.
--
-- This adds the missing operation: pull a player out of one round and hand
-- their opponent the bye they should have had. It is the mirror image of
-- _apply_late_entry_pairing_unchecked, which absorbs a waiting bye into a real
-- match when someone joins mid-tournament.

-- ── _remove_player_from_round_unchecked ──────────────────────────────────────
-- Take p_player_id out of round p_round. Their opponent (if any) inherits the
-- slot as a bye, matching how the round would have looked had the player never
-- been paired:
--
--   * round not begun  → 'ready' with no result, so the bye is finalised the
--                        normal way when the round starts
--   * round under way  → 'bye' / result 'bye' / winner = opponent, exactly what
--                        startRound would have written
--
-- A player already sitting on a bye simply loses the row. No authorisation
-- check — callers are responsible. Not granted to client roles.

CREATE OR REPLACE FUNCTION public._remove_player_from_round_unchecked(
  p_player_id     UUID,
  p_tournament_id UUID,
  p_round         INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION
  public._remove_player_from_round_unchecked(UUID, UUID, INTEGER) FROM PUBLIC;

-- ── remove_player_from_round ─────────────────────────────────────────────────
-- Organiser-facing. The player keeps their entry, their record and their place
-- in future pairings — they are only missing from this one round.

CREATE OR REPLACE FUNCTION public.remove_player_from_round(
  p_player_id UUID,
  p_round     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id UUID;
  v_workspace_id  UUID;
BEGIN
  SELECT tp.tournament_id, tp.workspace_id
  INTO v_tournament_id, v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can change pairings';
  END IF;

  -- Same lock late joins take, so a player scanning the QR right now cannot
  -- absorb the bye we are in the middle of creating.
  PERFORM 1 FROM public.tournaments WHERE id = v_tournament_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND m.round_number  = p_round
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'That match already has a result. Clear the result first.';
  END IF;

  PERFORM public._remove_player_from_round_unchecked(
    p_player_id, v_tournament_id, p_round
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_player_from_round(UUID, INTEGER)
  TO authenticated;

-- ── delete_tournament_entry ──────────────────────────────────────────────────
-- Removing someone from a round is the right fix for a no-show. It is the wrong
-- fix for a duplicate entry, which should never have existed: leaving it in
-- place keeps a phantom in the standings holding a bye it never earned.
--
-- So: allow the entry to be deleted outright while the tournament is running,
-- but only while it has no real result to erase. Anything already played stays
-- drop-only.
--
-- The per-round repair has to run BEFORE the delete. tournament_matches.player2_id
-- is ON DELETE SET NULL, so deleting the row on its own would leave the opponent
-- holding a bye-shaped match with no bye status, result or winner.

CREATE OR REPLACE FUNCTION public.delete_tournament_entry(
  p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id UUID;
  v_workspace_id  UUID;
  v_round         INTEGER;
BEGIN
  SELECT tp.tournament_id, tp.workspace_id
  INTO v_tournament_id, v_workspace_id
  FROM public.tournament_players tp
  WHERE tp.id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can remove players';
  END IF;

  PERFORM 1 FROM public.tournaments WHERE id = v_tournament_id FOR UPDATE;

  -- A completed match against a real opponent is a played game. Byes and the
  -- auto-losses a late entry picks up for missed rounds are not.
  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This player has already played a match, so drop them instead of deleting.';
  END IF;

  FOR v_round IN
    SELECT DISTINCT m.round_number
    FROM public.tournament_matches m
    WHERE m.tournament_id = v_tournament_id
      AND (m.player1_id = p_player_id OR m.player2_id = p_player_id)
    ORDER BY m.round_number DESC
  LOOP
    PERFORM public._remove_player_from_round_unchecked(
      p_player_id, v_tournament_id, v_round
    );
  END LOOP;

  DELETE FROM public.tournament_players WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tournament_entry(UUID) TO authenticated;
