-- ── Fix: NULL-role guards silently authorise non-members ─────────────────────
-- public.get_workspace_role() returns NULL when the caller is not a member of
-- the workspace. Four SECURITY DEFINER functions guarded on it like this:
--
--   IF public.get_workspace_role(v_workspace_id) NOT IN ('owner', 'admin') THEN
--     RAISE EXCEPTION '...';
--   END IF;
--
-- For a non-member the expression is `NULL NOT IN (...)` → NULL, not TRUE, so
-- the IF branch never fires and the guard falls through. Any authenticated
-- user who knows the relevant UUID could therefore:
--
--   * create_player_claim_link        — mint a claim token for ANY player entry
--                                       in ANY workspace, then accept it and
--                                       take over that player (report results
--                                       as them, read their pairings);
--   * revoke_player_claim_link        — cancel a pending claim link;
--   * add_known_players_to_tournament — add players to someone else's tournament;
--   * set_tournament_join_enabled     — open or close self-registration on
--                                       someone else's tournament.
--
-- Found while testing the organiser "Link account" button, which is the first
-- UI to call create_player_claim_link.
--
-- Fix: COALESCE the role to '' so the comparison is never NULL. Bodies are
-- otherwise unchanged.

-- ── create_player_claim_link ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_player_claim_link(
  p_tournament_player_id UUID
)
RETURNS TABLE(token TEXT, claim_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_token        TEXT;
  v_claim_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_players
  WHERE id = p_tournament_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can create claim links';
  END IF;

  -- Revoke any existing pending claim for this player
  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE tournament_player_id = p_tournament_player_id
    AND status = 'pending';

  -- Let the column DEFAULT (encode(gen_random_bytes(32), 'hex')) generate the token.
  INSERT INTO public.tournament_player_claims (tournament_player_id, workspace_id, created_by)
  VALUES (p_tournament_player_id, v_workspace_id, auth.uid())
  RETURNING id, tournament_player_claims.token INTO v_claim_id, v_token;

  RETURN QUERY SELECT v_token, v_claim_id;
END;
$$;

-- ── revoke_player_claim_link ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_player_claim_link(
  p_claim_id UUID
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

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournament_player_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can revoke claim links';
  END IF;

  UPDATE public.tournament_player_claims
  SET status = 'revoked'
  WHERE id = p_claim_id AND status = 'pending';
END;
$$;

-- ── add_known_players_to_tournament ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_known_players_to_tournament(
  p_tournament_id UUID,
  p_user_ids      UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_uid          UUID;
  v_name         TEXT;
  v_inserted     INTEGER := 0;
  v_rows         INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can add known players';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_players
      WHERE workspace_id = v_workspace_id AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'User % is not a known player in this workspace', v_uid;
    END IF;

    SELECT COALESCE(wp.preferred_name, p.display_name, 'Player')
    INTO v_name
    FROM public.workspace_players wp
    LEFT JOIN public.profiles p ON p.id = wp.user_id
    WHERE wp.workspace_id = v_workspace_id AND wp.user_id = v_uid;

    INSERT INTO public.tournament_players (tournament_id, workspace_id, user_id, name, created_by)
    VALUES (p_tournament_id, v_workspace_id, v_uid, v_name, auth.uid())
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ── set_tournament_join_enabled ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_tournament_join_enabled(
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

  -- Only workspace owner/admin may toggle self-registration.
  IF COALESCE(public.get_workspace_role(v_workspace_id), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  IF p_enabled THEN
    IF v_existing_code IS NULL THEN
      v_new_code := generate_join_code();
    ELSE
      v_new_code := v_existing_code;
    END IF;

    UPDATE public.tournaments
    SET join_enabled = TRUE, join_code = v_new_code
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_new_code;
  ELSE
    UPDATE public.tournaments
    SET join_enabled = FALSE
    WHERE id = p_tournament_id;

    RETURN QUERY SELECT v_existing_code;
  END IF;
END;
$$;
