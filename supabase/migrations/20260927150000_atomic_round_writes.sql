-- ── Atomic round writes ──────────────────────────────────────────────────────
-- Until now the browser wrote rounds as a series of separate requests: delete
-- the old rows, then insert the new ones; or flip the tournament to active,
-- then insert round 1, then try to flip it back by hand if the insert failed.
-- A dropped connection between two of those requests left a round half-written
-- (edited pairings deleted but never re-inserted, a tournament marked active
-- with no round 1), and two organiser tabs could interleave their writes.
--
-- Pairing itself stays in the browser — the Swiss engine is the most heavily
-- tested code in the repo and there is nothing to gain by porting it. Only the
-- write moves here, so each one lands whole or not at all.
--
-- Every function takes the tournament row lock first. Late joins and
-- remove_player_from_round take the same lock, so a player scanning the QR
-- code cannot slip into a round while it is being created or rewritten.

-- ── _insert_round_matches ────────────────────────────────────────────────────
-- Internal. Inserts a round's matches from the browser's pairing output.
--
-- workspace_id comes from the tournament, never from the caller, and every
-- player must belong to this tournament: an organiser of one event cannot
-- write another event's players into it. Duplicate players within a round are
-- left to the unique indexes on tournament_matches, which already refuse them.

CREATE OR REPLACE FUNCTION public._insert_round_matches(
  p_tournament_id UUID,
  p_workspace_id  UUID,
  p_round_number  INTEGER,
  p_matches       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_matches IS NULL
     OR jsonb_typeof(p_matches) <> 'array'
     OR jsonb_array_length(p_matches) = 0 THEN
    RAISE EXCEPTION 'No pairings to save';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_matches) AS m(player1_id UUID, player2_id UUID)
    WHERE m.player1_id IS NULL
       OR m.player1_id = m.player2_id
       OR NOT EXISTS (
         SELECT 1 FROM public.tournament_players tp
         WHERE tp.id = m.player1_id AND tp.tournament_id = p_tournament_id
       )
       OR (m.player2_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.tournament_players tp
         WHERE tp.id = m.player2_id AND tp.tournament_id = p_tournament_id
       ))
  ) THEN
    RAISE EXCEPTION 'Pairings include a player who is not in this tournament';
  END IF;

  INSERT INTO public.tournament_matches (
    tournament_id, workspace_id, round_number, match_number,
    player1_id, player2_id, status, pairing_decision_log
  )
  SELECT
    p_tournament_id, p_workspace_id, p_round_number, m.match_number,
    m.player1_id, m.player2_id, 'ready', m.pairing_decision_log
  FROM jsonb_to_recordset(p_matches) AS m(
    match_number         INTEGER,
    player1_id           UUID,
    player2_id           UUID,
    pairing_decision_log JSONB
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public._insert_round_matches(UUID, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;

-- ── create_round ─────────────────────────────────────────────────────────────
-- Pairs a round that has no matches yet: round 1 after a start whose pairing
-- failed, or the next round. Refuses a round that already has matches, which
-- is what makes a second tab clicking "Next round" a harmless error instead of
-- a second set of pairings. The round clock is reset in the same transaction,
-- so a new round never inherits the last round's running timer.

CREATE OR REPLACE FUNCTION public.create_round(
  p_tournament_id UUID,
  p_round_number  INTEGER,
  p_matches       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_status       TEXT;
  v_num_rounds   INTEGER;
BEGIN
  SELECT t.workspace_id, t.status, t.num_rounds
  INTO v_workspace_id, v_status, v_num_rounds
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can pair rounds';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Rounds can only be paired while the tournament is running';
  END IF;

  IF p_round_number < 1 OR (v_num_rounds IS NOT NULL AND p_round_number > v_num_rounds) THEN
    RAISE EXCEPTION 'Round % is outside this tournament', p_round_number;
  END IF;

  IF p_round_number > 1 AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = p_round_number - 1
  ) THEN
    RAISE EXCEPTION 'Round % has not been paired yet', p_round_number - 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number  = p_round_number
  ) THEN
    RAISE EXCEPTION 'Round % has already been paired', p_round_number;
  END IF;

  PERFORM public._insert_round_matches(
    p_tournament_id, v_workspace_id, p_round_number, p_matches
  );

  UPDATE public.tournaments
  SET current_round_started_at = NULL,
      round_elapsed_seconds    = 0,
      round_is_paused          = false
  WHERE id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.create_round(UUID, INTEGER, JSONB) TO authenticated;

-- ── start_tournament ─────────────────────────────────────────────────────────
-- Starts a draft tournament and pairs round 1 together. The browser used to
-- set the tournament active, insert round 1, and on failure try to set it back
-- to draft with a third request — which could itself fail and strand an
-- active tournament with no pairings.

CREATE OR REPLACE FUNCTION public.start_tournament(
  p_tournament_id UUID,
  p_num_rounds    INTEGER,
  p_matches       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_status       TEXT;
BEGIN
  SELECT t.workspace_id, t.status
  INTO v_workspace_id, v_status
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can start a tournament';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'This tournament has already started';
  END IF;

  IF p_num_rounds IS NULL OR p_num_rounds < 1 OR p_num_rounds > 20 THEN
    RAISE EXCEPTION 'A tournament needs between 1 and 20 rounds';
  END IF;

  UPDATE public.tournaments
  SET status       = 'active',
      num_rounds   = p_num_rounds,
      join_enabled = false
  WHERE id = p_tournament_id;

  PERFORM public.create_round(p_tournament_id, 1, p_matches);
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.start_tournament(UUID, INTEGER, JSONB) TO authenticated;

-- ── replace_round_matches ────────────────────────────────────────────────────
-- Saves edited pairings: deletes the matches that changed and inserts their
-- replacements in one transaction, then marks the round's
-- unplayed pairings unpublished so players are not shown a board that has
-- since moved. Deleting before inserting is still needed — swapping two
-- players between rows would trip the per-round unique indexes otherwise —
-- but a failure now rolls back the delete too.
--
-- A match with a result cannot be replaced. The editor only opens before a
-- round begins, so this only refuses what a stale tab might try.

CREATE OR REPLACE FUNCTION public.replace_round_matches(
  p_tournament_id UUID,
  p_round_number  INTEGER,
  p_match_ids     UUID[],
  p_matches       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_found        INTEGER;
BEGIN
  SELECT t.workspace_id
  INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Only organisers can change pairings';
  END IF;

  IF p_match_ids IS NULL OR cardinality(p_match_ids) = 0 THEN
    RAISE EXCEPTION 'No pairings to replace';
  END IF;

  SELECT count(*) INTO v_found
  FROM public.tournament_matches m
  WHERE m.id = ANY (p_match_ids)
    AND m.tournament_id = p_tournament_id
    AND m.round_number  = p_round_number;

  IF v_found <> cardinality(p_match_ids) THEN
    RAISE EXCEPTION 'These pairings have changed since you opened them. Refresh and try again.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.id = ANY (p_match_ids)
      AND m.status = 'completed'
      AND m.player2_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A match you edited already has a result. Clear the result first.';
  END IF;

  DELETE FROM public.tournament_matches WHERE id = ANY (p_match_ids);

  PERFORM public._insert_round_matches(
    p_tournament_id, v_workspace_id, p_round_number, p_matches
  );

  UPDATE public.tournament_matches
  SET pairings_published = false
  WHERE tournament_id = p_tournament_id
    AND round_number  = p_round_number
    AND status        = 'ready';
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.replace_round_matches(UUID, INTEGER, UUID[], JSONB) TO authenticated;
