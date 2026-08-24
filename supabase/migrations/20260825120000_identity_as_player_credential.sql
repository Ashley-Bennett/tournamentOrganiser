-- ── Identity as a player credential ──────────────────────────────────────────
-- Until now, every player-facing RPC proved "who you are" with ONE mechanism:
-- the per-tournament device_token minted by self_join_tournament and cached in
-- the player's browser. That means:
--   * organiser-added players (device_token IS NULL) can never reach the player
--     portal — there is no secret to hand them;
--   * setting tournament_players.user_id has no effect, because nothing reads
--     it, so every account-linking mechanism (claim links, known players,
--     late self-join) sets a column that grants no access.
--
-- This migration adds a SECOND accepted proof: being signed in as the account
-- the row belongs to. Purely additive — anonymous players keep their token and
-- behave exactly as before; no existing rows change.

-- ── assert_player_access ─────────────────────────────────────────────────────
-- Single source of truth for "may this caller act as this player?".
-- Accepts either a matching device_token OR auth.uid() = tournament_players.user_id.
-- Pass p_tournament_id NULL to skip the tournament check (callers that derive
-- the tournament from the player row itself).
-- Raises 'Invalid player credentials' on failure so existing client-side error
-- handling (which string-matches this message) keeps working unchanged.

CREATE OR REPLACE FUNCTION public.assert_player_access(
  p_player_id     UUID,
  p_tournament_id UUID,
  p_device_token  TEXT
)
RETURNS public.tournament_players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN v_player;
END;
$$;

-- Internal helper: only ever called from inside other SECURITY DEFINER
-- functions, so it needs no direct grant. Revoke the PUBLIC default.
REVOKE EXECUTE ON FUNCTION public.assert_player_access(UUID, UUID, TEXT) FROM PUBLIC;

-- ── get_player_tournament_view ───────────────────────────────────────────────
-- Body unchanged except the credential block.

CREATE OR REPLACE FUNCTION public.get_player_tournament_view(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player     public.tournament_players%ROWTYPE;
  v_tournament RECORD;
  v_result     JSONB;
BEGIN
  -- Validate device_token or account ownership
  v_player := public.assert_player_access(p_player_id, p_tournament_id, p_device_token);

  -- Fetch tournament
  SELECT id, name, status, num_rounds,
         round_duration_minutes, current_round_started_at,
         round_elapsed_seconds, round_is_paused, round_note
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  SELECT jsonb_build_object(
    'tournament', jsonb_build_object(
      'id',                       v_tournament.id,
      'name',                     v_tournament.name,
      'status',                   v_tournament.status,
      'num_rounds',               v_tournament.num_rounds,
      'round_duration_minutes',   v_tournament.round_duration_minutes,
      'current_round_started_at', v_tournament.current_round_started_at,
      'round_elapsed_seconds',    v_tournament.round_elapsed_seconds,
      'round_is_paused',          v_tournament.round_is_paused,
      'round_note',               v_tournament.round_note
    ),
    'player', jsonb_build_object(
      'id',               v_player.id,
      'name',             v_player.name,
      'dropped',          v_player.dropped,
      'dropped_at_round', v_player.dropped_at_round,
      'deck_pokemon1',    v_player.deck_pokemon1,
      'deck_pokemon2',    v_player.deck_pokemon2
    ),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',               tp.id,
        'name',             tp.name,
        'dropped',          tp.dropped,
        'dropped_at_round', tp.dropped_at_round,
        'deck_pokemon1',    tp.deck_pokemon1,
        'deck_pokemon2',    tp.deck_pokemon2
      ))
      FROM public.tournament_players tp
      WHERE tp.tournament_id = p_tournament_id
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',                 m.id,
        'round_number',       m.round_number,
        'match_number',       m.match_number,
        'player1_id',         m.player1_id,
        'player1_name',       p1.name,
        'player2_id',         m.player2_id,
        'player2_name',       p2.name,
        'winner_id',          m.winner_id,
        'result',             m.result,
        'temp_result',        m.temp_result,
        'temp_winner_id',     m.temp_winner_id,
        'status',             m.status,
        'confirmed_by',       m.confirmed_by,
        'pairings_published', m.pairings_published,
        'is_my_match',        (m.player1_id = p_player_id OR m.player2_id = p_player_id),
        'report_count',       (
          SELECT COUNT(*)::int
          FROM public.match_result_reports r
          WHERE r.match_id = m.id
        )
      ) ORDER BY m.round_number ASC, m.match_number ASC NULLS LAST)
      FROM public.tournament_matches m
      JOIN public.tournament_players p1 ON p1.id = m.player1_id
      LEFT JOIN public.tournament_players p2 ON p2.id = m.player2_id
      WHERE m.tournament_id = p_tournament_id
        AND (m.pairings_published = true OR m.status IN ('pending', 'completed', 'bye'))
    ), '[]'::jsonb),
    'my_report', (
      SELECT jsonb_build_object('reported_outcome', r.reported_outcome)
      FROM public.match_result_reports r
      JOIN public.tournament_matches m ON m.id = r.match_id
      WHERE r.player_id = p_player_id
        AND m.tournament_id = p_tournament_id
        AND m.status IN ('ready', 'pending')
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_player_tournament_view(UUID, UUID, TEXT) TO authenticated;

-- ── submit_match_result ──────────────────────────────────────────────────────
-- Body unchanged except the credential block, which now runs AFTER the match
-- lookup so it can assert the player belongs to the match's tournament. The
-- previous check omitted that, so a valid token for a player in tournament A
-- passed validation on a match in tournament B (the "player is not in this
-- match" guard caught it immediately after, so this is a tightening, not a fix
-- for a live hole).

CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match_id         UUID,
  p_player_id        UUID,
  p_device_token     TEXT,
  p_reported_outcome TEXT   -- 'win' | 'loss' | 'draw'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match           RECORD;
  v_other_player_id UUID;
  v_other_outcome   TEXT;
  v_winner_id       UUID;
  v_result_str      TEXT;
BEGIN
  IF p_reported_outcome NOT IN ('win', 'loss', 'draw') THEN
    RAISE EXCEPTION 'Invalid outcome: must be win, loss, or draw';
  END IF;

  SELECT id, tournament_id, player1_id, player2_id, status
  INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Validate device_token or account ownership
  PERFORM public.assert_player_access(p_player_id, v_match.tournament_id, p_device_token);

  IF v_match.player1_id <> p_player_id AND v_match.player2_id <> p_player_id THEN
    RAISE EXCEPTION 'Player is not in this match';
  END IF;

  IF v_match.player2_id IS NULL THEN
    RAISE EXCEPTION 'Cannot submit result for a bye match';
  END IF;

  IF v_match.status IN ('completed', 'bye') THEN
    RAISE EXCEPTION 'Match is already completed';
  END IF;

  -- Upsert this player's report
  INSERT INTO public.match_result_reports (match_id, player_id, reported_outcome)
  VALUES (p_match_id, p_player_id, p_reported_outcome)
  ON CONFLICT (match_id, player_id)
  DO UPDATE SET reported_outcome = EXCLUDED.reported_outcome,
                submitted_at     = now();

  v_other_player_id := CASE
    WHEN v_match.player1_id = p_player_id THEN v_match.player2_id
    ELSE v_match.player1_id
  END;

  -- Derive winner_id and result string from this player's reported outcome
  IF p_reported_outcome = 'draw' THEN
    v_winner_id  := NULL;
    v_result_str := 'Draw';
  ELSIF p_reported_outcome = 'win' THEN
    v_winner_id  := p_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '1-0' ELSE '0-1' END;
  ELSE -- 'loss'
    v_winner_id  := v_other_player_id;
    v_result_str := CASE WHEN v_match.player1_id = p_player_id THEN '0-1' ELSE '1-0' END;
  END IF;

  -- Check if the other player has submitted
  SELECT reported_outcome INTO v_other_outcome
  FROM public.match_result_reports
  WHERE match_id = p_match_id AND player_id = v_other_player_id;

  IF NOT FOUND THEN
    -- First submission: pre-fill result and temp fields for organiser UI
    UPDATE public.tournament_matches
    SET winner_id      = v_winner_id,
        result         = v_result_str,
        temp_winner_id = v_winner_id,
        temp_result    = v_result_str,
        confirmed_by   = 'player_report'
    WHERE id = p_match_id;
    RETURN jsonb_build_object('status', 'submitted');
  END IF;

  -- Both submitted — check for agreement
  IF (p_reported_outcome = 'win'  AND v_other_outcome = 'loss')
  OR (p_reported_outcome = 'loss' AND v_other_outcome = 'win')
  OR (p_reported_outcome = 'draw' AND v_other_outcome = 'draw')
  THEN
    -- Agreement: stay pending for organiser to confirm; pre-fill temp fields
    UPDATE public.tournament_matches
    SET winner_id      = v_winner_id,
        result         = v_result_str,
        temp_winner_id = v_winner_id,
        temp_result    = v_result_str,
        confirmed_by   = 'player_agreement'
    WHERE id = p_match_id;
    RETURN jsonb_build_object('status', 'agreed');
  END IF;

  -- Conflict: apply this player's claim and pre-fill temp fields
  UPDATE public.tournament_matches
  SET winner_id      = v_winner_id,
      result         = v_result_str,
      temp_winner_id = v_winner_id,
      temp_result    = v_result_str,
      confirmed_by   = 'conflict'
  WHERE id = p_match_id;
  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_match_result(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── set_player_deck ──────────────────────────────────────────────────────────
-- Body unchanged except the credential block.

CREATE OR REPLACE FUNCTION public.set_player_deck(
  p_tournament_id UUID,
  p_player_id     UUID,
  p_device_token  TEXT,
  p_pokemon1      INTEGER,
  p_pokemon2      INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate device_token or account ownership
  PERFORM public.assert_player_access(p_player_id, p_tournament_id, p_device_token);

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  UPDATE public.tournament_players
  SET deck_pokemon1 = p_pokemon1,
      deck_pokemon2 = p_pokemon2
  WHERE id = p_player_id
    AND tournament_id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.set_player_deck(UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ── save_push_subscription ───────────────────────────────────────────────────
-- Body unchanged except the credential block. The tournament is derived from
-- the player row, so p_tournament_id is passed as NULL.

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint             TEXT,
  p_p256dh               TEXT,
  p_auth                 TEXT,
  p_tournament_player_id UUID,
  p_device_token         TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, UUID, TEXT)
  TO anon, authenticated;
