-- ============================================================
-- Player flow fixes (2026-07-26)
--
-- 1. Restore auto-link on self_join_tournament. The deck migration
--    (20260721120312_self_join_with_deck) rewrote the function and
--    dropped `user_id = auth.uid()` from the INSERT, so joining while
--    logged in created an UNLINKED entry. get_my_player_entries
--    filters on user_id, so the tournament vanished from the user's
--    account and forced a manual "Link" step. The June autolink
--    migration (20260618000002) originally added this; re-add it.
--
-- 2. get_my_tournament_entry(p_tournament_id): lets a signed-in owner
--    recover their player_id + device_token for a tournament they've
--    linked, so the player view works on ANY device — not only the
--    one holding the localStorage token. Returns the token only for
--    the row owned by auth.uid().
--
-- 3. Default profiles.onboarding_intent to 'player' so new accounts
--    start in the player role.
-- ============================================================

-- 1. Restore auto-link -------------------------------------------------------

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
  v_workspace_id    UUID;
  v_status          TEXT;
  v_join_enabled    BOOLEAN;
  v_tournament_name TEXT;
  v_player_id       UUID;
  v_device_token    TEXT;
  v_trimmed_name    TEXT;
BEGIN
  v_trimmed_name := trim(p_player_name);

  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Player name is required';
  END IF;

  -- Validate pokemon IDs: base pokemon are 1-1025, form entries (Mega/regional/Gmax)
  -- use IDs starting at 10001. Upper bound of 99999 covers all foreseeable additions.
  IF p_pokemon1 IS NOT NULL AND (p_pokemon1 < 1 OR p_pokemon1 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;
  IF p_pokemon2 IS NOT NULL AND (p_pokemon2 < 1 OR p_pokemon2 > 99999) THEN
    RAISE EXCEPTION 'Invalid pokemon id';
  END IF;

  SELECT t.workspace_id, t.status, t.join_enabled, t.name
  INTO v_workspace_id, v_status, v_join_enabled, v_tournament_name
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT v_join_enabled THEN
    RAISE EXCEPTION 'Registration is not open for this tournament';
  END IF;

  IF v_status <> 'draft' THEN
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
    deck_pokemon1, deck_pokemon2, user_id
  )
  VALUES (
    p_tournament_id, v_workspace_id, v_trimmed_name, v_device_token, p_device_id,
    p_pokemon1, p_pokemon2,
    auth.uid()  -- NULL for anonymous, user id for authenticated (auto-link)
  )
  RETURNING id INTO v_player_id;

  RETURN QUERY SELECT v_player_id, v_device_token, v_tournament_name::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.self_join_tournament(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- 2. Owner device-token recovery --------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tournament_entry(
  p_tournament_id UUID
)
RETURNS TABLE(player_id UUID, device_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT tp.id, tp.device_token
  FROM public.tournament_players tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.user_id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tournament_entry(UUID) TO authenticated;

-- 3. Default preferred role to player ---------------------------------------

ALTER TABLE public.profiles ALTER COLUMN onboarding_intent SET DEFAULT 'player';
