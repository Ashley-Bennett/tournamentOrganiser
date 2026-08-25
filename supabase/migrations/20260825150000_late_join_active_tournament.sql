-- ── Late self-join while a tournament is active ──────────────────────────────
-- Until now the join link died the moment a tournament started: self_join_tournament
-- rejects status <> 'draft', and starting force-sets join_enabled = false. A player
-- arriving after round 1 had to be added by the organiser as a loose name.
--
-- Two things make player-initiated late entry possible:
--
--   1. A gate the organiser controls (tournaments.allow_late_join), so the QR at
--      the venue keeps working after the tournament starts — but only when the
--      organiser says so.
--
--   2. Moving the late-entry pairing server-side. RLS on tournament_matches gates
--      INSERT/UPDATE on is_workspace_member(), and a joining player is not a member,
--      so the pairing cannot run on their client the way it runs on the organiser's.
--
-- Point 2 also fixes a pre-existing duplication: the pairing logic was written
-- twice in TypeScript (TournamentView.applyLateEntryPairing and the inline block
-- in TournamentMatches.handleAddLateEntry). Both are replaced by the single
-- implementation below, so the organiser path and the player path can never drift.

-- ── Schema ───────────────────────────────────────────────────────────────────

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS allow_late_join BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional cutoff: players may join up to and including this round. NULL means
-- no limit (any round while the tournament is active), which is today's
-- behaviour for organiser-added late entries. Enforced below; no UI yet.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS late_join_until_round INTEGER;

GRANT SELECT (allow_late_join, late_join_until_round)
  ON public.tournaments TO anon, authenticated;

-- ── _apply_late_entry_pairing_unchecked ──────────────────────────────────────
-- Single source of truth for slotting a late entry into a running tournament.
-- A direct port of the TypeScript that previously did this client-side; the four
-- branches and their exact statuses/results are preserved:
--
--   * missed rounds        → a completed 'loss' record per round already finished
--   * round not yet begun  → absorb the waiting bye ('ready'), else become it
--   * round in progress    → absorb the waiting bye ('pending'), else take a 'bye'
--   * round complete       → nothing; the player is picked up by the next pairing
--
-- No authorisation check — callers are responsible. Not granted to client roles.

CREATE OR REPLACE FUNCTION public._apply_late_entry_pairing_unchecked(
  p_player_id     UUID,
  p_tournament_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id     UUID;
  v_max_round        INTEGER;
  v_round_has_begun  BOOLEAN;
  v_round_complete   BOOLEAN;
  v_pre_begin_round  BOOLEAN;
  v_round_count      INTEGER;
  v_max_match_num    INTEGER;
  v_missed_rounds    INTEGER;
  v_existing_bye_id  UUID;
BEGIN
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT COALESCE(MAX(m.round_number), 1) INTO v_max_round
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id;

  -- Snapshot the current round BEFORE inserting anything, so the new player's
  -- own rows can never be mistaken for an existing bye.
  SELECT
    COUNT(*),
    COALESCE(MAX(COALESCE(m.match_number, 0)), 0),
    -- "Round has begun" = Begin Round was pressed (real matches move to 'pending').
    -- Byes created as 'bye' at tournament start do NOT count as begun.
    BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL)),
    BOOL_AND(m.status IN ('completed', 'bye'))
  INTO v_round_count, v_max_match_num, v_round_has_begun, v_round_complete
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number = v_max_round;

  v_round_has_begun := COALESCE(v_round_has_begun, FALSE);
  v_round_complete  := v_round_count > 0 AND COALESCE(v_round_complete, FALSE);
  v_pre_begin_round := v_round_count > 0 AND NOT v_round_has_begun AND NOT v_round_complete;

  SELECT m.id INTO v_existing_bye_id
  FROM public.tournament_matches m
  WHERE m.tournament_id = p_tournament_id
    AND m.round_number = v_max_round
    AND m.player2_id IS NULL
    AND m.player1_id <> p_player_id
  ORDER BY m.match_number NULLS LAST
  LIMIT 1;

  -- Create a loss record for every completed round the player missed.
  -- Rounds 1..(max_round - 1) are always complete; max_round is complete only
  -- when v_round_complete is true.
  v_missed_rounds := CASE WHEN v_round_complete THEN v_max_round ELSE v_max_round - 1 END;

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

  IF v_pre_begin_round THEN
    IF v_existing_bye_id IS NOT NULL THEN
      -- Pair the waiting bye player with the new player; back to a real match.
      UPDATE public.tournament_matches
      SET player2_id = p_player_id,
          status     = 'ready',
          result     = NULL,
          winner_id  = NULL
      WHERE id = v_existing_bye_id;
    ELSE
      -- No existing bye: the new player waits as the bye for this round.
      INSERT INTO public.tournament_matches (
        tournament_id, workspace_id, round_number, match_number,
        player1_id, player2_id, status, result, winner_id
      )
      VALUES (
        p_tournament_id, v_workspace_id, v_max_round, v_max_match_num + 1,
        p_player_id, NULL, 'ready', NULL, NULL
      );
    END IF;

  ELSIF v_round_has_begun AND NOT v_round_complete THEN
    IF v_existing_bye_id IS NOT NULL THEN
      -- Convert the bye into a real in-progress match.
      UPDATE public.tournament_matches
      SET player2_id = p_player_id,
          status     = 'pending',
          result     = NULL,
          winner_id  = NULL
      WHERE id = v_existing_bye_id;
    ELSE
      INSERT INTO public.tournament_matches (
        tournament_id, workspace_id, round_number, match_number,
        player1_id, player2_id, status, result, winner_id
      )
      VALUES (
        p_tournament_id, v_workspace_id, v_max_round, v_max_match_num + 1,
        p_player_id, NULL, 'bye', 'bye', p_player_id
      );
    END IF;
  END IF;
  -- v_round_complete: nothing to do — the player enters the next round's pairings.
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public._apply_late_entry_pairing_unchecked(UUID, UUID) FROM PUBLIC;

-- ── apply_late_entry_pairing ─────────────────────────────────────────────────
-- Organiser-facing wrapper. Replaces the two client-side implementations.

CREATE OR REPLACE FUNCTION public.apply_late_entry_pairing(
  p_player_id     UUID,
  p_tournament_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialise concurrent late entries so two callers cannot both claim the
  -- same waiting bye.
  SELECT t.workspace_id INTO v_workspace_id
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_players tp
    WHERE tp.id = p_player_id AND tp.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Player is not in this tournament';
  END IF;

  PERFORM public._apply_late_entry_pairing_unchecked(p_player_id, p_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_late_entry_pairing(UUID, UUID) TO authenticated;

-- ── set_tournament_allow_late_join ───────────────────────────────────────────
-- Organiser toggle for mid-tournament joins. Mirrors set_tournament_join_enabled:
-- ensures a join_code exists so the room code and QR keep resolving.

CREATE OR REPLACE FUNCTION public.set_tournament_allow_late_join(
  p_tournament_id UUID,
  p_enabled       BOOLEAN
)
RETURNS TABLE (join_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id  UUID;
  v_existing_code TEXT;
  v_new_code      TEXT;
BEGIN
  SELECT t.workspace_id, t.join_code
    INTO v_workspace_id, v_existing_code
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  IF p_enabled AND v_existing_code IS NULL THEN
    v_new_code := generate_join_code();
  ELSE
    v_new_code := v_existing_code;
  END IF;

  UPDATE public.tournaments
  SET allow_late_join = p_enabled,
      join_code       = v_new_code
  WHERE id = p_tournament_id;

  RETURN QUERY SELECT v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tournament_allow_late_join(UUID, BOOLEAN)
  TO authenticated;

-- ── self_join_tournament ─────────────────────────────────────────────────────
-- Now accepts an active tournament when allow_late_join is on, flags the entry
-- as a late entry, and runs the shared pairing. Draft behaviour is unchanged.

CREATE OR REPLACE FUNCTION public.self_join_tournament(
  p_tournament_id UUID,
  p_player_name   TEXT,
  p_device_id     TEXT DEFAULT NULL,
  p_pokemon1      INTEGER DEFAULT NULL,
  p_pokemon2      INTEGER DEFAULT NULL
)
RETURNS TABLE(player_id UUID, device_token TEXT, tournament_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id     UUID;
  v_status           TEXT;
  v_join_enabled     BOOLEAN;
  v_allow_late_join  BOOLEAN;
  v_until_round      INTEGER;
  v_tournament_name  TEXT;
  v_player_id        UUID;
  v_device_token     TEXT;
  v_trimmed_name     TEXT;
  v_is_late_entry    BOOLEAN := FALSE;
  v_current_round    INTEGER;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  IF length(v_trimmed_name) > 50 THEN
    RAISE EXCEPTION 'Player name is too long (max 50 characters)';
  END IF;

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  -- Lock the tournament so concurrent joins serialise: without this, two players
  -- scanning the QR at the same moment could both absorb the same waiting bye.
  SELECT t.workspace_id, t.status, t.join_enabled, t.allow_late_join,
         t.late_join_until_round, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_allow_late_join,
       v_until_round, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_status = 'draft' THEN
    IF NOT v_join_enabled THEN
      RAISE EXCEPTION 'Registration is not open for this tournament';
    END IF;

  ELSIF v_status = 'active' THEN
    IF NOT v_allow_late_join THEN
      RAISE EXCEPTION 'Registration is closed';
    END IF;

    v_is_late_entry := TRUE;

    SELECT COALESCE(MAX(m.round_number), 1) INTO v_current_round
    FROM public.tournament_matches m
    WHERE m.tournament_id = p_tournament_id;

    -- Optional cutoff. NULL means no limit.
    IF v_until_round IS NOT NULL AND v_current_round > v_until_round THEN
      RAISE EXCEPTION 'Late entry closed after round %', v_until_round;
    END IF;

  ELSE
    RAISE EXCEPTION 'Registration is closed';
  END IF;

  -- Case-insensitive duplicate name check
  IF EXISTS (
    SELECT 1 FROM public.tournament_players
    WHERE tournament_id = p_tournament_id
      AND lower(name) = lower(v_trimmed_name)
  ) THEN
    RAISE EXCEPTION 'A player with that name is already registered';
  END IF;

  -- Generate a 64-char hex token using gen_random_uuid() (no pgcrypto path issues)
  v_device_token := replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.tournament_players (
    tournament_id, workspace_id, name, device_token, device_id,
    deck_pokemon1, deck_pokemon2, user_id, is_late_entry, late_entry_round
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2,
    auth.uid(),  -- NULL for anonymous, user id for authenticated (auto-link)
    v_is_late_entry,
    CASE WHEN v_is_late_entry THEN v_current_round ELSE NULL END
  )
  RETURNING id INTO v_player_id;

  IF v_is_late_entry THEN
    PERFORM public._apply_late_entry_pairing_unchecked(v_player_id, p_tournament_id);
  END IF;

  RETURN QUERY SELECT v_player_id, v_device_token, v_tournament_name::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER)
  TO anon, authenticated;

-- ── get_tournament_for_join ──────────────────────────────────────────────────
-- Reports late-join state so the join page can open for an active tournament and
-- explain what the player is walking into.

DROP FUNCTION IF EXISTS public.get_tournament_for_join(UUID);

CREATE FUNCTION public.get_tournament_for_join(
  p_tournament_id UUID
)
RETURNS TABLE(
  tournament_name  TEXT,
  status           TEXT,
  join_enabled     BOOLEAN,
  registered_names TEXT[],
  starts_at        TIMESTAMPTZ,
  game_format      TEXT,
  location         TEXT,
  description      TEXT,
  allow_late_join  BOOLEAN,
  current_round    INTEGER,
  round_in_progress BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.name::TEXT,
    t.status::TEXT,
    t.join_enabled,
    CASE
      WHEN t.join_enabled AND t.status = 'draft' THEN
        COALESCE(
          ARRAY(
            SELECT tp.name
            FROM public.tournament_players tp
            WHERE tp.tournament_id = p_tournament_id
            ORDER BY tp.created_at
          ),
          '{}'::TEXT[]
        )
      ELSE '{}'::TEXT[]
    END,
    t.starts_at,
    t.game_format::TEXT,
    t.location::TEXT,
    t.description::TEXT,
    -- Only advertise late join while the cutoff (if any) still allows it.
    (
      t.allow_late_join
      AND t.status = 'active'
      AND (
        t.late_join_until_round IS NULL
        OR COALESCE((
          SELECT MAX(m.round_number) FROM public.tournament_matches m
          WHERE m.tournament_id = p_tournament_id
        ), 1) <= t.late_join_until_round
      )
    ),
    COALESCE((
      SELECT MAX(m.round_number) FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
    ), 1),
    COALESCE((
      SELECT BOOL_OR(m.status = 'pending' OR (m.status = 'completed' AND m.player2_id IS NOT NULL))
      FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.round_number = (
          SELECT MAX(m2.round_number) FROM public.tournament_matches m2
          WHERE m2.tournament_id = p_tournament_id
        )
    ), FALSE)
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tournament_for_join(UUID) TO anon, authenticated;
